import { chromium } from "playwright";
import { expect, it } from "vitest";
import {
  compileFragment,
  lowerFragment,
  ShaderDiagnosticCode,
} from "../src/index.js";

const shapes = ["s", "v2", "v3", "v4"] as const;
const cases = shapes.flatMap((shape) => [
  `sqrt(${shape})`,
  `exp(${shape})`,
  `tanh(${shape})`,
  `clamp(${shape}, ${shape}, ${shape})`,
  `pow(${shape}, ${shape})`,
]);
function source(call: string, output: string = "coord"): string {
  return `import { createFragmentShader, vec2, vec3, vec4, sqrt, exp, tanh, clamp, pow } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const result = ${call};
  return ${output};
});`;
}

it("lowers and emits all 20 same-shape signatures from one target-neutral IR", () => {
  expect(cases).toHaveLength(20);
  for (const call of cases) {
    const text = source(call);
    const glsl = compileFragment(text, { target: "glsl-es-300" });
    const wgsl = compileFragment(text, { target: "wgsl" });
    expect(glsl.ok, call).toBe(true);
    expect(wgsl.ok, call).toBe(true);
    if (!glsl.ok || !wgsl.ok) continue;
    expect(glsl.ir, call).toEqual(wgsl.ir);
    const name = call.slice(0, call.indexOf("("));
    expect(glsl.code, call).toContain(`${name}(`);
    expect(wgsl.code, call).toContain(`${name}(`);
    expect(JSON.stringify(glsl.ir), call).toContain(`"name":"${name}"`);
  }
});

it("validates generated GLSL and WGSL for all 20 signatures in real target compilers", async () => {
  const shaders = cases.map((call) => {
    const text = source(call);
    const glsl = compileFragment(text, { target: "glsl-es-300" });
    const wgsl = compileFragment(text, { target: "wgsl" });
    expect(glsl.ok, call).toBe(true);
    expect(wgsl.ok, call).toBe(true);
    if (!glsl.ok || !wgsl.ok) throw new Error(call);
    return { glsl: glsl.code, wgsl: wgsl.code };
  });
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--enable-unsafe-swiftshader",
      "--enable-unsafe-webgpu",
      "--use-angle=swiftshader",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.route("http://localhost/", (route) =>
      route.fulfill({ body: "<!doctype html><canvas></canvas>" }),
    );
    await page.goto("http://localhost/");
    const errors = await page.evaluate(async (codes) => {
      const gl = document.querySelector("canvas")!.getContext("webgl2")!;
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU unavailable");
      const device = await adapter.requestDevice();
      try {
        const output = [];
        for (const { glsl, wgsl } of codes) {
          const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
          gl.shaderSource(shader, glsl);
          gl.compileShader(shader);
          const glslError = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
            ? null
            : gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          const wgslErrors = (
            await device.createShaderModule({ code: wgsl }).getCompilationInfo()
          ).messages
            .filter((m) => m.type === "error")
            .map((m) => m.message);
          output.push({ glslError, wgslErrors });
        }
        return output;
      } finally {
        device.destroy();
      }
    }, shaders);
    expect(errors).toEqual(
      cases.map(() => ({ glslError: null, wgslErrors: [] })),
    );
  } finally {
    await browser.close();
  }
}, 60_000);

it.each([
  ["sqrt(s, s)", ShaderDiagnosticCode.InvalidBuiltin],
  ["exp(v2, v2)", ShaderDiagnosticCode.InvalidBuiltin],
  ["tanh(v2, s)", ShaderDiagnosticCode.InvalidBuiltin],
  ["clamp(v3, s, v3)", ShaderDiagnosticCode.InvalidBuiltin],
  ["clamp(v2, v3, v2)", ShaderDiagnosticCode.InvalidBuiltin],
  ["pow(v2, s)", ShaderDiagnosticCode.InvalidBuiltin],
  ["pow(s, v2)", ShaderDiagnosticCode.InvalidBuiltin],
  ["sqrt(-1)", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ["sqrt(vec3(1, -0.5, 4))", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ["sqrt(-1e-50)", null],
  ["clamp(s, 2, 1)", ShaderDiagnosticCode.InvalidBuiltinDomain],
  [
    "clamp(v2, vec2(0, 2), vec2(1, 1))",
    ShaderDiagnosticCode.InvalidBuiltinDomain,
  ],
  ["clamp(v2, vec2(1), vec2(1))", null],
  ["pow(-2, 2)", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ["pow(0, 0)", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ["pow(0, -1)", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ["pow(10, 100)", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ["pow(vec2(2, 0), vec2(1, -1))", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ["exp(89)", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ["exp(1000)", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ["exp(vec2(0, 100))", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ["sqrt(s)", null],
  ["clamp(v2, v2, v2)", null],
  ["pow(v2, v2)", null],
])("checks domain and signature of %s at original call", (call, code) => {
  const text = source(call);
  const result = lowerFragment(text);
  if (code === null) {
    expect(result.ok, call).toBe(true);
  } else {
    expect(result.ok, call).toBe(false);
    if (!result.ok)
      expect(result.diagnostics, call).toEqual([
        expect.objectContaining({
          code,
          range: { start: text.indexOf(call), length: call.length },
        }),
      ]);
  }
});

it("checks constant aliases, nested exact results and only provable violations", () => {
  for (const [call, code] of [
    ["sqrt(negative)", ShaderDiagnosticCode.InvalidBuiltinDomain],
    ["clamp(s, lower, upper)", ShaderDiagnosticCode.InvalidBuiltinDomain],
    ["pow(sqrt(0), exp(0) - 1)", ShaderDiagnosticCode.InvalidBuiltinDomain],
    ["sqrt(sin(-1))", null],
    ["pow(sin(-1), -1)", null],
    ["clamp(s, sin(2), sin(1))", null],
  ] as const) {
    const text = source(call)
      .replace(
        "  const result =",
        "  const negative = -1;\n  const lower = 2;\n  const upper = 1;\n  const result =",
      )
      .replace(
        "sqrt, exp, tanh, clamp, pow",
        "sqrt, exp, tanh, clamp, pow, sin",
      );
    const result = lowerFragment(text);
    expect(result.ok, call).toBe(code === null);
    if (!result.ok)
      expect(result.diagnostics[0]).toMatchObject({
        code,
        range: { start: text.indexOf(call), length: call.length },
      });
  }
});

it("finds known invalid components alongside dynamic vector components through swizzles and aliases", () => {
  for (const [call, expectedCode] of [
    ["sqrt(vec2(s, -1))", ShaderDiagnosticCode.InvalidBuiltinDomain],
    ["exp(vec2(s, 1000))", ShaderDiagnosticCode.InvalidBuiltinDomain],
    [
      "clamp(v2, vec2(s, 2), vec2(1))",
      ShaderDiagnosticCode.InvalidBuiltinDomain,
    ],
    [
      "pow(vec2(s, 2), vec2(s, 130))",
      ShaderDiagnosticCode.InvalidBuiltinDomain,
    ],
    ["sqrt(alias.yx)", ShaderDiagnosticCode.InvalidBuiltinDomain],
    ["sqrt(vec2(s, 0))", null],
    ["clamp(v2, vec2(s, 1), vec2(1))", null],
    ["sqrt(vec2(s, -1e-50))", null],
  ] as const) {
    const text = source(call).replace(
      "  const result =",
      "  const component = vec2(-1, s);\n  const alias = component;\n  const result =",
    );
    const result = lowerFragment(text);
    expect(result.ok, call).toBe(expectedCode === null);
    if (!result.ok)
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: expectedCode,
          range: { start: text.indexOf(call), length: call.length },
        }),
      ]);
  }
});

it.each([
  "pow(2, 130)",
  "pow(10, 39)",
  "pow(vec2(2, 10), vec2(1, 39))",
  "sqrt(3e38 + 3e38)",
  "exp(3e38 + 3e38)",
  "tanh(3e38 + 3e38)",
  "tanh(vec2(s, 3e38 + 3e38))",
  "tanh(vec2(s, 3e38 + 3e38).x)",
  "tanh(nonFinite)",
  "pow(3e38 + 3e38, 1)",
  "clamp(s, 3e38 + 3e38, 1)",
  "sqrt(nonFinite)",
  "sqrt(sin(3e38 + 3e38))",
  "sqrt(vec2(s, 3e38 + 3e38).x)",
  "sqrt(alias.x)",
])("diagnoses provably non-finite compound or pow results at %s", (call) => {
  const text = source(call)
    .replace("pow }", "pow, sin }")
    .replace(
      "  const result =",
      "  const nonFinite = 3e38 + 3e38;\n  const alias = vec2(s, nonFinite);\n  const result =",
    );
  const result = lowerFragment(text);
  expect(result.ok, call).toBe(false);
  if (!result.ok)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: ShaderDiagnosticCode.InvalidBuiltinDomain,
        range: { start: text.indexOf(call), length: call.length },
      }),
    ]);
});

it("compiles generated WGSL without constant-folding unclassified domain calls", async () => {
  const texts = [
    "sqrt(sin(-1))",
    "pow(sin(-1), -1)",
    "clamp(s, sin(2), sin(1))",
    "exp(80)",
    "exp(88.9)",
    "tanh(1000)",
    "tanh(-1000)",
    "tanh(vec2(s, 1000))",
    "pow(2, 3)",
    "sqrt(-1e-50)",
    "sqrt(2e38 - 2e38)",
    "pow(2, 127)",
    "sqrt(vec2(s, 0).y)",
  ];
  const modules = texts.map((call) => {
    const result = compileFragment(
      source(call).replace("pow }", "pow, sin }"),
      { target: "wgsl" },
    );
    expect(result.ok, call).toBe(true);
    if (!result.ok) throw Error(call);
    return result.code;
  });
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-unsafe-swiftshader", "--enable-unsafe-webgpu"],
  });
  try {
    const page = await browser.newPage();
    await page.route("http://localhost/", (route) =>
      route.fulfill({ body: "<!doctype html>" }),
    );
    await page.goto("http://localhost/");
    const errors = await page.evaluate(async (codes) => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU unavailable");
      const device = await adapter.requestDevice();
      try {
        return await Promise.all(
          codes.map(async (code) =>
            (
              await device.createShaderModule({ code }).getCompilationInfo()
            ).messages
              .filter((m) => m.type === "error")
              .map((m) => m.message),
          ),
        );
      } finally {
        device.destroy();
      }
    }, modules);
    expect(errors).toEqual(texts.map(() => []));
  } finally {
    await browser.close();
  }
}, 60_000);
