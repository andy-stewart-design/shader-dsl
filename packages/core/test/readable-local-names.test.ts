import { chromium } from "playwright";
import { expect, it } from "vitest";
import { compileFragmentArtifact } from "../src/compile-fragment-artifact.js";
import { isSafeShaderLocalName } from "../src/shader-reserved-name.js";

const authored = (
  body: string,
) => `import { createFragmentShader, sqrt, vec2, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});`;

it("uses authored names and minimal safe grouping in both full fragments", () => {
  const result = compileFragmentArtifact(
    authored(`const inputMouse = vec2(uniforms.mouse.x, uniforms.resolution.y - uniforms.mouse.y);
  const gain = uniforms.time;
  return vec4(inputMouse.x * gain, 0, 0, 1);`),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.artifact.glsl).toContain(
    "vec2 inputMouse = vec2(u_mouse.x, u_resolution.y - u_mouse.y);",
  );
  expect(result.artifact.glsl).toContain("float gain = u_time;");
  expect(result.artifact.glsl).toContain(
    "vec4(inputMouse.x * gain, 0.0, 0.0, 1.0)",
  );
  expect(result.artifact.wgsl).toContain(
    "let inputMouse: vec2<f32> = vec2<f32>(shdr_mouse.x, shdr_resolution.y - shdr_mouse.y);",
  );
  expect(result.artifact.wgsl).toContain("let gain: f32 = shdr_time;");
  expect(result.artifact.wgsl).toContain(
    "vec4<f32>(inputMouse.x * gain, 0.0f, 0.0f, 1.0f)",
  );
});

it("uses a conservative cross-target identifier predicate, not just a JavaScript identifier regex", () => {
  for (const name of ["inputMouse", "gain", "_leading", "a1"]) {
    expect(isSafeShaderLocalName(name), name).toBe(true);
  }
  for (const name of [
    "_",
    "let",
    "fn",
    "alias",
    "override",
    "attribute",
    "sampler2D",
    "vec2",
    "vec2f",
    "mat2x2f",
    "sin",
    "textureSample",
    "atomicAdd",
    "main",
    "ShdrCustomUniforms",
    "u_mouse",
    "u_resolution",
    "u_time",
    "shdr_coord",
    "shdr_local_1",
    "gl_Foo",
    "a__b",
    "__private",
    "$color",
    "café",
  ]) {
    expect(isSafeShaderLocalName(name), name).toBe(false);
  }
});

it("falls back for hostile authored names, reserving all fallback slots first", () => {
  const result = compileFragmentArtifact(
    authored(`const shdr_local_1 = coord;
  const inputMouse = shdr_local_1.x;
  const attribute = inputMouse;
  const $color = attribute;
  const café = $color;
  const sampler2D = café;
  const gl_Foo = sampler2D;
  const a__b = gl_Foo;
  return vec4(a__b, 0, 0, 1);`),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.artifact.glsl).toContain("vec4 shdr_local_0 = shdr_coord;");
  expect(result.artifact.glsl).toContain("float inputMouse = shdr_local_0.x;");
  expect(result.artifact.glsl).toContain("float shdr_local_2 = inputMouse;");
  expect(result.artifact.glsl).toContain("float shdr_local_7 = shdr_local_6;");
  expect(result.artifact.wgsl).toContain(
    "let inputMouse: f32 = shdr_local_0.x;",
  );
  expect(result.artifact.wgsl).toContain(
    "let shdr_local_7: f32 = shdr_local_6;",
  );
  for (const name of [
    "attribute",
    "$color",
    "café",
    "sampler2D",
    "gl_Foo",
    "a__b",
  ]) {
    expect(result.artifact.glsl).not.toContain(`float ${name} =`);
    expect(result.artifact.wgsl).not.toContain(`let ${name}:`);
  }
});

it("compiles readable, unsafe and helper-bearing full shaders in real WebGL 2 and WebGPU", async () => {
  const shaders = [
    authored(`const inputMouse = vec2(uniforms.mouse.x, uniforms.resolution.y - uniforms.mouse.y);
  const gain = uniforms.time;
  return vec4(inputMouse.x * gain, 0, 0, 1);`),
    authored(`const attribute = coord;
  const shdr_local_1 = attribute.x;
  const $color = shdr_local_1;
  const café = $color;
  return vec4(café, 0, 0, 1);`),
    authored(`const u_mouse = sqrt(uniforms.time);
  const inputMouse = vec2(u_mouse, uniforms.mouse.y);
  const gl_Foo = inputMouse.x;
  return vec4(gl_Foo, 0, 0, 1);`),
    authored(`const fn = uniforms.time;
  const sampler2D = fn;
  return vec4(sampler2D, 0, 0, 1);`),
  ];
  const artifacts = shaders.map((source) => {
    const compiled = compileFragmentArtifact(source);
    expect(compiled.ok, source).toBe(true);
    if (!compiled.ok) throw new Error("Cannot compile fixture");
    return compiled.artifact;
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
    const errors = await page.evaluate(async (samples) => {
      const gl = document.querySelector("canvas")!.getContext("webgl2")!;
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw Error("WebGPU unavailable");
      const device = await adapter.requestDevice();
      try {
        return await Promise.all(
          samples.map(async (artifact) => {
            const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
            gl.shaderSource(fragment, artifact.glsl);
            gl.compileShader(fragment);
            const glsl = gl.getShaderParameter(fragment, gl.COMPILE_STATUS)
              ? null
              : gl.getShaderInfoLog(fragment);
            gl.deleteShader(fragment);
            const info = await device
              .createShaderModule({ code: artifact.wgsl })
              .getCompilationInfo();
            return {
              glsl,
              wgsl: info.messages
                .filter((item) => item.type === "error")
                .map((item) => item.message),
            };
          }),
        );
      } finally {
        device.destroy();
      }
    }, artifacts);
    expect(errors).toEqual(artifacts.map(() => ({ glsl: null, wgsl: [] })));
  } finally {
    await browser.close();
  }
}, 60_000);
