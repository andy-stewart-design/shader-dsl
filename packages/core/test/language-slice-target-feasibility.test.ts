import { chromium } from "playwright";
import { expect, it } from "vitest";

// Raw shader syntax only. This checks that the proposed Phase 2.1 rule matrix
// is expressible on both targets; it does not exercise the Shdr compiler.
const GLSL = `#version 300 es
precision highp float;
out vec4 color;
void main() {
  float s = 0.5;
  float scalar = -s + s - s * s / s;
  vec2 v2 = vec2(s, 1.0);
  vec3 v3 = vec3(s, s, 1.0);
  vec4 v4 = vec4(s, s, s, 1.0);
  vec2 copy2 = vec2(v2);
  vec3 copy3 = vec3(v3);
  vec2 splat2 = vec2(s);
  vec3 splat3 = vec3(s);
  vec2 r2 = -(v2 + copy2 - splat2) * v2 / copy2 * s / s;
  vec3 r3 = -(v3 + copy3 - splat3) * v3 / copy3 * s / s;
  vec4 r4 = -(v4 + v4 - v4) * v4 / v4 * s / s;
  vec4 repeated2 = r2.xxyy;
  vec4 repeated3 = r3.zyxz;
  color = vec4(scalar, r3.z, r4.w, repeated2.y) + repeated3;
}
`;

const WGSL = `@fragment fn main() -> @location(0) vec4<f32> {
  let s: f32 = 0.5;
  let scalar: f32 = -s + s - s * s / s;
  let v2: vec2<f32> = vec2<f32>(s, 1.0);
  let v3: vec3<f32> = vec3<f32>(s, s, 1.0);
  let v4: vec4<f32> = vec4<f32>(s, s, s, 1.0);
  let copy2: vec2<f32> = vec2<f32>(v2);
  let copy3: vec3<f32> = vec3<f32>(v3);
  let splat2: vec2<f32> = vec2<f32>(s);
  let splat3: vec3<f32> = vec3<f32>(s);
  let r2: vec2<f32> = -(v2 + copy2 - splat2) * v2 / copy2 * s / s;
  let r3: vec3<f32> = -(v3 + copy3 - splat3) * v3 / copy3 * s / s;
  let r4: vec4<f32> = -(v4 + v4 - v4) * v4 / v4 * s / s;
  let repeated2: vec4<f32> = r2.xxyy;
  let repeated3: vec4<f32> = r3.zyxz;
  return vec4<f32>(scalar, r3.z, r4.w, repeated2.y) + repeated3;
}
`;

it("compiles the proposed arithmetic, constructors, and swizzles on both targets", async () => {
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
    const status = await page.evaluate(
      async ({ glsl, wgsl }) => {
        const gl = document.querySelector("canvas")?.getContext("webgl2");
        if (!gl) return { glsl: "WebGL 2 unavailable", wgsl: "not checked" };
        const shader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!shader)
          return { glsl: "Could not create shader", wgsl: "not checked" };
        gl.shaderSource(shader, glsl);
        gl.compileShader(shader);
        const glslError = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
          ? null
          : (gl.getShaderInfoLog(shader) ?? "GLSL compilation failed");
        gl.deleteShader(shader);

        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter)
          return { glsl: glslError, wgsl: "WebGPU adapter unavailable" };
        const device = await adapter.requestDevice();
        try {
          const module = device.createShaderModule({ code: wgsl });
          const info = await module.getCompilationInfo();
          return {
            glsl: glslError,
            wgsl:
              info.messages
                .filter((message) => message.type === "error")
                .map((message) => message.message)
                .join("\n") || null,
          };
        } finally {
          device.destroy();
        }
      },
      { glsl: GLSL, wgsl: WGSL },
    );
    expect(status.glsl).toBeNull();
    expect(status.wgsl).toBeNull();
  } finally {
    await browser.close();
  }
}, 30_000);
