import { chromium } from "playwright";
import { expect, it } from "vitest";

type Shape = "s" | "v2" | "v3" | "v4";
interface Case {
  readonly name: string;
  readonly expression: string;
  readonly wgslExpression?: string;
  readonly shape: Shape;
}

const cases: Case[] = [
  { name: "mix(S,S,S)", expression: "mix(s, t, s)", shape: "s" },
  { name: "step(S,S)", expression: "step(s, t)", shape: "s" },
];
for (const size of [2, 3, 4] as const) {
  const v = `v${size}` as const;
  const w = `w${size}` as const;
  cases.push(
    {
      name: `mix(V${size},V${size},S)`,
      expression: `mix(${v}, ${w}, s)`,
      shape: v,
    },
    {
      name: `mix(V${size},V${size},V${size})`,
      expression: `mix(${v}, ${w}, ${v})`,
      shape: v,
    },
    {
      name: `step(V${size},V${size})`,
      expression: `step(${v}, ${w})`,
      shape: v,
    },
    {
      name: `step(S,V${size})`,
      expression: `step(s, ${v})`,
      wgslExpression: `step(vec${size}<f32>(s), ${v})`,
      shape: v,
    },
  );
}

const glslTypes: Record<Shape, string> = {
  s: "float",
  v2: "vec2",
  v3: "vec3",
  v4: "vec4",
};
const wgslTypes: Record<Shape, string> = {
  s: "f32",
  v2: "vec2<f32>",
  v3: "vec3<f32>",
  v4: "vec4<f32>",
};
const GLSL = `#version 300 es
precision highp float;
out vec4 color;
void main() {
  float s = 0.3;
  float t = 0.7;
  vec2 v2 = vec2(0.25, 0.75);
  vec3 v3 = vec3(0.25, 0.5, 0.75);
  vec4 v4 = vec4(0.25, 0.5, 0.75, 1.0);
  vec2 w2 = vec2(0.65, 0.15);
  vec3 w3 = vec3(0.65, 0.15, 0.85);
  vec4 w4 = vec4(0.65, 0.15, 0.85, 0.4);
  float sum = 0.0;
${cases.map((item, index) => `  ${glslTypes[item.shape]} r${index} = ${item.expression};\n  sum += ${item.shape === "s" ? `r${index}` : `r${index}.x`};`).join("\n")}
  color = vec4(sum);
}`;
const WGSL = `@fragment fn main() -> @location(0) vec4<f32> {
  let s: f32 = 0.3;
  let t: f32 = 0.7;
  let v2: vec2<f32> = vec2<f32>(0.25, 0.75);
  let v3: vec3<f32> = vec3<f32>(0.25, 0.5, 0.75);
  let v4: vec4<f32> = vec4<f32>(0.25, 0.5, 0.75, 1.0);
  let w2: vec2<f32> = vec2<f32>(0.65, 0.15);
  let w3: vec3<f32> = vec3<f32>(0.65, 0.15, 0.85);
  let w4: vec4<f32> = vec4<f32>(0.65, 0.15, 0.85, 0.4);
  var sum: f32 = 0.0;
${cases.map((item, index) => `  let r${index}: ${wgslTypes[item.shape]} = ${item.wgslExpression ?? item.expression};\n  sum += ${item.shape === "s" ? `r${index}` : `r${index}.x`};`).join("\n")}
  return vec4<f32>(sum);
}`;

it("validates all 14 mix/step signature shapes against raw GLSL and WGSL", async () => {
  expect(cases).toHaveLength(14);
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
    const result = await page.evaluate(
      async ({ glsl, wgsl }) => {
        const gl = document.querySelector("canvas")?.getContext("webgl2");
        if (!gl) throw new Error("WebGL 2 unavailable");
        const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(shader, glsl);
        gl.compileShader(shader);
        const glslError = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
          ? null
          : gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        try {
          const info = await device
            .createShaderModule({ code: wgsl })
            .getCompilationInfo();
          return {
            glslError,
            wgslErrors: info.messages
              .filter((message) => message.type === "error")
              .map((message) => message.message),
          };
        } finally {
          device.destroy();
        }
      },
      { glsl: GLSL, wgsl: WGSL },
    );
    expect(result.glslError).toBeNull();
    expect(result.wgslErrors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 30_000);
