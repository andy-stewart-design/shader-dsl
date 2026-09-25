import { chromium } from "playwright";
import { expect, it } from "vitest";

import { generateFragment, lowerFragment } from "../src/index.js";
import { readShaderFixture } from "./read-shader-fixture.js";

const VERTEX = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

function freezeDeep(value: unknown): void {
  if (value === null || typeof value !== "object" || Object.isFrozen(value))
    return;
  Object.freeze(value);
  for (const item of Object.values(value)) freezeDeep(item);
}

it("lowers an expanded fragment once and compiles/renders GLSL and compiles WGSL", async () => {
  const source = await readShaderFixture("expanded");
  const lowered = lowerFragment(source);
  expect(lowered.ok).toBe(true);
  if (!lowered.ok) return;
  const before = JSON.stringify(lowered.ir);
  freezeDeep(lowered.ir);
  const glsl = generateFragment(lowered.ir, "glsl-es-300");
  const wgsl = generateFragment(lowered.ir, "wgsl");
  expect(JSON.stringify(lowered.ir)).toBe(before);
  expect(generateFragment(lowered.ir, "wgsl")).toBe(wgsl);
  expect(generateFragment(lowered.ir, "glsl-es-300")).toBe(glsl);
  expect(glsl).toContain("vec3(");
  expect(wgsl).toContain("vec3<f32>(");
  expect(wgsl).toContain(".xxyy");

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
      route.fulfill({
        body: "<!doctype html><canvas width=8 height=8></canvas>",
      }),
    );
    await page.goto("http://localhost/");
    const status = await page.evaluate(
      async ({ fragment, vertex, wgsl }) => {
        const gl = document
          .querySelector("canvas")
          ?.getContext("webgl2", { preserveDrawingBuffer: true });
        if (!gl) return { error: "WebGL 2 unavailable" };
        const compile = (type: number, source: string) => {
          const shader = gl.createShader(type);
          if (!shader) throw new Error("Unable to create WebGL shader");
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(
              gl.getShaderInfoLog(shader) ?? "GLSL compile failed",
            );
          }
          return shader;
        };
        const program = gl.createProgram();
        if (!program) throw new Error("Unable to create WebGL program");
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) ?? "GLSL link failed");
        }
        gl.useProgram(program);
        gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), 8, 8);
        gl.viewport(0, 0, 8, 8);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixel = new Uint8Array(4);
        gl.readPixels(3, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (gl.getError() !== gl.NO_ERROR)
          throw new Error("WebGL readback failed");

        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) return { error: "WebGPU adapter unavailable" };
        const device = await adapter.requestDevice();
        try {
          const info = await device
            .createShaderModule({ code: wgsl })
            .getCompilationInfo();
          return {
            pixel: [...pixel],
            errors: info.messages
              .filter((message) => message.type === "error")
              .map((message) => message.message),
          };
        } finally {
          device.destroy();
        }
      },
      { fragment: glsl, vertex: VERTEX, wgsl },
    );
    expect(status).not.toHaveProperty("error");
    expect(status.errors).toEqual([]);
    expect(status.pixel).toBeDefined();
    const [red, green, blue, alpha] = status.pixel ?? [];
    expect(red).toBeGreaterThanOrEqual(125);
    expect(red).toBeLessThanOrEqual(130);
    expect(green).toBeGreaterThanOrEqual(69);
    expect(green).toBeLessThanOrEqual(75);
    expect(blue).toBeGreaterThanOrEqual(69);
    expect(blue).toBeLessThanOrEqual(75);
    expect(alpha).toBe(255);
  } finally {
    await browser.close();
  }
}, 30_000);
