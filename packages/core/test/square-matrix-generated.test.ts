import { chromium } from "playwright";
import { expect, it } from "vitest";
import { generateFragmentOutput } from "../src/generate-fragment.js";
import { lowerFragment } from "../src/index.js";

const source = `import { createFragmentShader, mat2, mat3, mat4, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(({ uniforms }) => {
  const m2d = mat2(uniforms.time);
  const m2f = mat2(1, 2, 3, 4);
  const m2c = mat2(vec2(1, 2), vec2(3, 4));
  const m2x = mat2(m2d);
  const m3d = mat3(uniforms.time);
  const m3f = mat3(1, 2, 3, 4, 5, 6, 7, 8, 9);
  const m3c = mat3(vec3(1, 2, 3), vec3(4, 5, 6), vec3(7, 8, 9));
  const m3x = mat3(m3d);
  const m4d = mat4(uniforms.time);
  const m4f = mat4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
  const m4c = mat4(vec4(1, 2, 3, 4), vec4(5, 6, 7, 8), vec4(9, 10, 11, 12), vec4(13, 14, 15, 16));
  const m4x = mat4(m4d);
  const m2add = m2d + m2f;
  const m2sub = m2d - m2f;
  const m2scale = m2d * uniforms.time;
  const m2scaleLeft = uniforms.time * m2d;
  const m2vector = m2d * vec2(1, 2);
  const m2vectorLeft = vec2(1, 2) * m2d;
  const m2compose = m2d * m2f;
  const m3add = m3d + m3f;
  const m3sub = m3d - m3f;
  const m3scale = m3d * uniforms.time;
  const m3scaleLeft = uniforms.time * m3d;
  const m3vector = m3d * vec3(1, 2, 3);
  const m3vectorLeft = vec3(1, 2, 3) * m3d;
  const m3compose = m3d * m3f;
  const m4add = m4d + m4f;
  const m4sub = m4d - m4f;
  const m4scale = m4d * uniforms.time;
  const m4scaleLeft = uniforms.time * m4d;
  const m4vector = m4d * vec4(1, 2, 3, 4);
  const m4vectorLeft = vec4(1, 2, 3, 4) * m4d;
  const m4compose = m4d * m4f;
  return vec4(1);
});`;

it("compiles generated matrix constructors on real WebGL 2 and WebGPU targets", async () => {
  const lowered = lowerFragment(source);
  expect(lowered.ok, JSON.stringify(lowered)).toBe(true);
  if (!lowered.ok) return;
  const glsl = generateFragmentOutput(lowered.ir, "glsl-es-300").code;
  const wgsl = generateFragmentOutput(lowered.ir, "wgsl").code;
  expect(glsl).toContain("mat2 shdr_internal_mat2(float value)");
  expect(glsl).toContain("mat4(m4d)");
  expect(wgsl).toContain("mat2x2<f32>");
  expect(wgsl).toContain("mat4x4<f32>");

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
          : (gl.getShaderInfoLog(shader) ?? "GLSL compilation failed");
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
      { glsl, wgsl },
    );
    expect(result).toEqual({ glslError: null, wgslErrors: [] });
  } finally {
    await browser.close();
  }
}, 60_000);
