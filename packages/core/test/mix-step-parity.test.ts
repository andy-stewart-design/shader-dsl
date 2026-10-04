import { chromium } from "playwright";
import { expect, it } from "vitest";

import {
  compileFragment,
  lowerFragment,
  ShaderDiagnosticCode,
} from "../src/index.js";

const shapes = ["s", "v2", "v3", "v4"] as const;
type Shape = (typeof shapes)[number];
interface Example {
  readonly name: "mix" | "step";
  readonly call: string;
  readonly shape: Shape;
}

const examples: Example[] = [
  { name: "mix", call: "mix(s, s, s)", shape: "s" },
  { name: "step", call: "step(s, s)", shape: "s" },
];
for (const size of [2, 3, 4] as const) {
  const v = `v${size}` as const;
  examples.push(
    { name: "mix", call: `mix(${v}, ${v}, s)`, shape: v },
    { name: "mix", call: `mix(${v}, ${v}, ${v})`, shape: v },
    { name: "step", call: `step(${v}, ${v})`, shape: v },
    { name: "step", call: `step(s, ${v})`, shape: v },
  );
}

function source(call: string, shape: Shape): string {
  const returned =
    shape === "s"
      ? `vec4(${call}, 0, 0, 1)`
      : shape === "v2"
        ? `vec4(${call}, 0, 1)`
        : shape === "v3"
          ? `vec4(${call}, 1)`
          : call;
  return `import { createFragmentShader, mix, step, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  return ${returned};
});`;
}

it("lowers the 14 accepted signatures to ordered, source-ranged, target-neutral calls", () => {
  expect(examples).toHaveLength(14);
  for (const item of examples) {
    const text = source(item.call, item.shape);
    const glsl = compileFragment(text, { target: "glsl-es-300" });
    const wgsl = compileFragment(text, { target: "wgsl" });
    expect(glsl.ok, item.call).toBe(true);
    expect(wgsl.ok, item.call).toBe(true);
    if (!glsl.ok || !wgsl.ok) continue;
    expect(glsl.ir, item.call).toEqual(wgsl.ir);
    const serialized = JSON.stringify(glsl.ir);
    expect(serialized).toContain(
      `"kind":"builtin-function","name":"${item.name}"`,
    );
    expect(serialized).not.toMatch(/shdr_internal_|gl_FragCoord|vec[234]<f32>/);
    expect(glsl.code, item.call).toContain(`${item.name}(`);
    expect(wgsl.code, item.call).toContain(`${item.name}(`);
    const range = { start: text.indexOf(item.call), length: item.call.length };
    expect(serialized).toContain(JSON.stringify(range));
    if (item.call.startsWith("step(s, v")) {
      const size = item.shape[1];
      expect(glsl.code).toContain("step(shdr_local_0, shdr_local_");
      expect(wgsl.code).toContain(
        `step(vec${size}<f32>(shdr_local_0), shdr_local_`,
      );
    }
    if (item.call.startsWith("mix(v")) {
      const factor = item.call.endsWith(", s)")
        ? "shdr_local_0"
        : `shdr_local_${item.shape[1] === "2" ? 1 : item.shape[1] === "3" ? 2 : 3}`;
      expect(wgsl.code).toContain(`, ${factor})`);
    }
  }
});

it.each([
  "mix(s, s)",
  "mix(s, s, v2)",
  "mix(v2, v3, s)",
  "mix(v3, v3, v2)",
  "step(s)",
  "step(v2, s)",
  "step(v2, v3)",
])("rejects %s at the authored call", (call) => {
  const text = source(call, "s");
  const lowered = lowerFragment(text);
  expect(lowered.ok).toBe(false);
  if (lowered.ok) return;
  expect(lowered.diagnostics).toEqual([
    expect.objectContaining({
      code: ShaderDiagnosticCode.InvalidBuiltin,
      range: { start: text.indexOf(call), length: call.length },
    }),
  ]);
});

it("validates generated GLSL and WGSL for every accepted signature", async () => {
  const shaders = examples.map(({ call, shape }) => {
    const glsl = compileFragment(source(call, shape), {
      target: "glsl-es-300",
    });
    const wgsl = compileFragment(source(call, shape), { target: "wgsl" });
    expect(glsl.ok, call).toBe(true);
    expect(wgsl.ok, call).toBe(true);
    if (!glsl.ok || !wgsl.ok) throw new Error(`Cannot compile ${call}`);
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
      route.fulfill({ body: "<!doctype html>" }),
    );
    await page.goto("http://localhost/");
    const errors = await page.evaluate(async (codes) => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      if (!gl) throw new Error("WebGL 2 unavailable");
      const glslErrors = codes.map(({ glsl: text }) => {
        const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(shader, text);
        gl.compileShader(shader);
        const message = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
          ? []
          : [gl.getShaderInfoLog(shader) ?? "GLSL compilation failed"];
        gl.deleteShader(shader);
        return message;
      });
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      try {
        const wgslErrors: string[][] = [];
        for (const shader of codes) {
          const info = await device
            .createShaderModule({ code: shader.wgsl })
            .getCompilationInfo();
          wgslErrors.push(
            info.messages
              .filter((message) => message.type === "error")
              .map((message) => message.message),
          );
        }
        return { glslErrors, wgslErrors };
      } finally {
        device.destroy();
      }
    }, shaders);
    expect(errors.glslErrors).toEqual(shaders.map(() => []));
    expect(errors.wgslErrors).toEqual(shaders.map(() => []));
  } finally {
    await browser.close();
  }
}, 60_000);

it("preserves named-import and call boundaries", () => {
  for (const [text, code] of [
    [
      source("mix(s, s, s)", "s").replace("mix, step,", "step,"),
      ShaderDiagnosticCode.UnsupportedCall,
    ],
    [source("Math.step(s, s)", "s"), ShaderDiagnosticCode.UnsupportedCall],
    [
      source("step(s, s)", "s").replace("step,", "step as threshold,"),
      ShaderDiagnosticCode.ImportAlias,
    ],
  ] as const) {
    const result = lowerFragment(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe(code);
  }
});
