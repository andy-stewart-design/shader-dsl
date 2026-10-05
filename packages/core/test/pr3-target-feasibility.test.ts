import { chromium } from "playwright";
import { expect, it } from "vitest";

// Raw target shaders: freeze the same-shape f32 signature and const-evaluation
// feasibility before adding Shdr overloads, IR lowering or target helpers.
const cases = [] as {
  label: string;
  glsl: string;
  wgsl: string;
  shape: string;
}[];
for (const [shape, glsl] of [
  ["S", "float"],
  ["V2", "vec2"],
  ["V3", "vec3"],
  ["V4", "vec4"],
] as const) {
  for (const name of ["sqrt", "exp", "tanh"] as const)
    cases.push({
      label: `${name}(${shape})`,
      glsl: `${name}(a)`,
      wgsl: `${name}(a)`,
      shape: glsl,
    });
  cases.push(
    {
      label: `clamp(${shape},${shape},${shape})`,
      glsl: "clamp(a, low, high)",
      wgsl: "clamp(a, low, high)",
      shape: glsl,
    },
    {
      label: `pow(${shape},${shape})`,
      glsl: "pow(a, high)",
      wgsl: "pow(a, high)",
      shape: glsl,
    },
  );
}

it("accepts all 20 same-shape f32 signatures in raw WebGL 2 and WebGPU", async () => {
  expect(cases).toHaveLength(20);
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
    const results = await page.evaluate(async (samples) => {
      const gl = document.querySelector("canvas")!.getContext("webgl2")!;
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU unavailable");
      const device = await adapter.requestDevice();
      try {
        const output = [];
        for (const { label, glsl, wgsl, shape } of samples) {
          const wgslType = shape === "float" ? "f32" : `${shape}<f32>`;
          const glslSource = `#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main() { ${shape} a = ${shape}(0.5); ${shape} low = ${shape}(0.0); ${shape} high = ${shape}(1.0); ${shape} r = ${glsl}; color = vec4(r${shape === "float" ? "" : ".x"}); }`;
          const wgslSource = `@fragment fn main() -> @location(0) vec4<f32> { let a: ${wgslType} = ${wgslType}(0.5); let low: ${wgslType} = ${wgslType}(0.0); let high: ${wgslType} = ${wgslType}(1.0); let r: ${wgslType} = ${wgsl}; return vec4<f32>(r${shape === "float" ? "" : ".x"}); }`;
          const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
          gl.shaderSource(shader, glslSource);
          gl.compileShader(shader);
          const glslError = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
            ? null
            : gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          const info = await device
            .createShaderModule({ code: wgslSource })
            .getCompilationInfo();
          output.push({
            label,
            glslError,
            wgslErrors: info.messages
              .filter((item) => item.type === "error")
              .map((item) => item.message),
          });
        }
        return output;
      } finally {
        device.destroy();
      }
    }, cases);
    expect(results).toEqual(
      cases.map(({ label }) => ({ label, glslError: null, wgslErrors: [] })),
    );
  } finally {
    await browser.close();
  }
}, 60_000);

it("confirms WGSL eager constant failures and parameterized-helper escape", async () => {
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
    const errors = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU unavailable");
      const device = await adapter.requestDevice();
      try {
        const bodies = {
          sqrt: "sqrt(sin(-1.0f))",
          exp: "exp(1000.0f)",
          pow: "pow(1e30f, 4.0f)",
          clamp: "clamp(0.5f, 1.0f, 0.0f)",
        };
        const output: Record<string, string[]> = {};
        for (const [name, expression] of Object.entries(bodies)) {
          for (const helper of [false, true]) {
            const declaration = helper
              ? `fn shdr_internal_eval_${name}(a: f32${name === "pow" ? ", b: f32" : name === "clamp" ? ", b: f32, c: f32" : ""}) -> f32 { return ${name}(${name === "sqrt" || name === "exp" ? "a" : name === "pow" ? "a, b" : "a, b, c"}); }`
              : "";
            const call = helper
              ? `shdr_internal_eval_${name}(${expression.slice(name.length + 1, -1)})`
              : expression;
            const code = `${declaration}\n@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(${call}); }`;
            const info = await device
              .createShaderModule({ code })
              .getCompilationInfo();
            output[`${name}:${helper ? "helper" : "direct"}`] = info.messages
              .filter((item) => item.type === "error")
              .map((item) => item.message);
          }
        }
        for (const name of ["sqrt", "tanh"]) {
          for (const [variant, declaration, call] of [
            ["direct", "", `${name}(3e38f + 3e38f)`],
            [
              "helper",
              `fn shdr_internal_eval_${name}(a: f32) -> f32 { return ${name}(a); }`,
              `shdr_internal_eval_${name}(3e38f + 3e38f)`,
            ],
          ]) {
            const info = await device
              .createShaderModule({
                code: `${declaration}\n@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(${call}); }`,
              })
              .getCompilationInfo();
            output[`compound:${name}:${variant}`] = info.messages
              .filter((item) => item.type === "error")
              .map((item) => item.message);
          }
        }
        const vectorInfo = await device
          .createShaderModule({
            code: `@fragment fn main(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> { let result = tanh(vec2<f32>(frag.x, 3e38f + 3e38f)); return vec4<f32>(result, 0.0f, 1.0f); }`,
          })
          .getCompilationInfo();
        output["compound:tanh:vector"] = vectorInfo.messages
          .filter((item) => item.type === "error")
          .map((item) => item.message);
        return output;
      } finally {
        device.destroy();
      }
    });
    // A helper cannot hide an overflowing constant argument. Core must
    // diagnose this source call before either generated target is installed.
    for (const name of ["sqrt", "tanh"]) {
      expect(errors[`compound:${name}:direct`], name).not.toEqual([]);
      expect(errors[`compound:${name}:helper`], name).not.toEqual([]);
    }
    expect(errors["compound:tanh:vector"]).not.toEqual([]);
    for (const name of ["sqrt", "exp", "pow", "clamp"]) {
      expect(errors[`${name}:direct`], name).not.toEqual([]);
      expect(errors[`${name}:helper`], name).toEqual([]);
    }
  } finally {
    await browser.close();
  }
}, 60_000);
