import { chromium } from "playwright";
import { expect, it } from "vitest";

import { compileFragmentArtifact } from "../src/compile-fragment-artifact.js";

const source = `import { clamp, createFragmentShader, defineShaderFunction, pow, vec2, vec3, vec4 } from "shdr";
import type { Expr, F32, Vec3 } from "shdr";

const nested = defineShaderFunction((value: Expr<Vec3<F32>>, exponent: Expr<F32>) =>
  pow(clamp(value, exponent, vec3(2)), exponent)
);

export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const clamp22 = clamp(v2, s, s);
  const clamp2s = clamp(v2, s, v2);
  const clamp2v = clamp(v2, v2, s);
  const pow2 = pow(v2, s);
  const clamp33 = clamp(v3, s, s);
  const clamp3s = clamp(v3, s, v3);
  const clamp3v = clamp(v3, v3, s);
  const pow3 = pow(v3, s);
  const clamp44 = clamp(v4, s, s);
  const clamp4s = clamp(v4, s, v4);
  const clamp4v = clamp(v4, v4, s);
  const pow4 = pow(v4, s);
  const nestedValue = nested(v3, s);
  return vec4(
    clamp22.x + clamp2s.x + clamp2v.x + pow2.x,
    clamp33.x + clamp3s.x + clamp3v.x + pow3.x,
    clamp44.x + clamp4s.x + clamp4v.x + pow4.x,
    nestedValue.x
  );
});`;

it("splats mixed clamp bounds and pow exponents while preserving one evaluation", async () => {
  const result = compileFragmentArtifact(source);
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.artifact.glsl).toContain("clamp(v2, vec2(s), vec2(s))");
  expect(result.artifact.glsl).toContain("clamp(v2, vec2(s), v2)");
  expect(result.artifact.glsl).toContain("clamp(v2, v2, vec2(s))");
  expect(result.artifact.glsl).toContain("pow(v2, vec2(s))");
  expect(result.artifact.wgsl).toContain(
    "shdr_internal_safe_clamp_vec2(v2, vec2<f32>(s), vec2<f32>(s))",
  );
  expect(result.artifact.wgsl).toContain(
    "shdr_internal_safe_pow_vec2(v2, vec2<f32>(s))",
  );
  expect(
    result.artifact.wgsl.match(/fn shdr_internal_safe_clamp_vec[234]\(/g),
  ).toEqual([
    "fn shdr_internal_safe_clamp_vec2(",
    "fn shdr_internal_safe_clamp_vec3(",
    "fn shdr_internal_safe_clamp_vec4(",
  ]);
  expect(
    result.artifact.wgsl.match(/fn shdr_internal_safe_pow_vec[234]\(/g),
  ).toEqual([
    "fn shdr_internal_safe_pow_vec2(",
    "fn shdr_internal_safe_pow_vec3(",
    "fn shdr_internal_safe_pow_vec4(",
  ]);

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
    const errors = await page.evaluate(async ({ glsl, wgsl }) => {
      const gl = document.querySelector("canvas")!.getContext("webgl2");
      if (!gl) throw new Error("WebGL 2 unavailable");
      const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(shader, glsl);
      gl.compileShader(shader);
      const glslErrors = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
        ? []
        : [gl.getShaderInfoLog(shader) ?? "GLSL compilation failed"];
      gl.deleteShader(shader);
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      try {
        const info = await device
          .createShaderModule({ code: wgsl })
          .getCompilationInfo();
        return {
          glslErrors,
          wgslErrors: info.messages
            .filter((message) => message.type === "error")
            .map((message) => message.message),
        };
      } finally {
        device.destroy();
      }
    }, result.artifact);
    expect(errors).toEqual({ glslErrors: [], wgslErrors: [] });
  } finally {
    await browser.close();
  }
}, 60_000);
