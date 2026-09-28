import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { expect, it } from "vitest";

import { compileFragment } from "../src/index.js";

const source = readFileSync(
  new URL(
    "../../../apps/vite-basic/src/math-builtins.shdr.ts",
    import.meta.url,
  ),
  "utf8",
);
const vertex = `#version 300 es
precision highp float;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;
const positions = [
  [32, 32],
  [64, 64],
  [96, 96],
] as const;

function expectedPixel(x: number, y: number, width: number): number[] {
  const ux = (x + 0.5) / width;
  const uy = (width - y - 0.5) / width;
  const smooth = (a: number, b: number, value: number): number => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const fract = (value: number): number => value - Math.floor(value);
  const wave = (value: number): number =>
    Math.sin(value * 2) + Math.cos(value * 3);
  const ripple = Math.hypot(fract(wave(ux)) - 0.5, fract(wave(uy)) - 0.5);
  const maskX = smooth(0.2, 0.8, ux);
  const maskY = smooth(0.2, 0.8, uy);
  const light = Math.abs(ux * 0.6 + uy * 0.8);
  const stripes = fract(Math.floor(ux * 8) * 0.17);
  return [
    Math.min(1, Math.max(0, light * maskX)),
    smooth(0.2, 0.8, stripes) * maskY,
    Math.min(1, Math.max(0, 1 - ripple)),
    1,
  ].map((channel) => Math.round(channel * 255));
}

it("renders the eleven-builtin source in generated WebGL and validates generated WGSL", async () => {
  expect(
    readFileSync(
      new URL(
        "../../../apps/editor-fixture/math-builtins.shdr.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ).toBe(source);
  const glsl = compileFragment(source, { target: "glsl-es-300" });
  const wgsl = compileFragment(source, { target: "wgsl" });
  expect(glsl.ok).toBe(true);
  expect(wgsl.ok).toBe(true);
  if (!glsl.ok || !wgsl.ok) return;
  expect(glsl.ir).toEqual(wgsl.ir);
  expect(glsl.code).toContain("smoothstep(");
  expect(wgsl.code).toContain("fn shdr_internal_smoothstep_vec2");

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
    const results = await page.evaluate(
      async ({ vertex, fragment, wgsl, positions }) => {
        const canvas = document.querySelector("canvas")!;
        canvas.width = canvas.height = 128;
        const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
        if (!gl) throw new Error("WebGL 2 unavailable");
        const compile = (kind: number, code: string): WebGLShader => {
          const shader = gl.createShader(kind)!;
          gl.shaderSource(shader, code);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader) ?? "shader failed");
          }
          return shader;
        };
        const vertexShader = compile(gl.VERTEX_SHADER, vertex);
        const fragmentShader = compile(gl.FRAGMENT_SHADER, fragment);
        const program = gl.createProgram()!;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
        }
        gl.useProgram(program);
        gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), 128, 128);
        gl.viewport(0, 0, 128, 128);
        gl.bindVertexArray(gl.createVertexArray());
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixels = positions.map(([x, y]) => {
          const rgba = new Uint8Array(4);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
          return [...rgba];
        });
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        try {
          const info = await device
            .createShaderModule({ code: wgsl })
            .getCompilationInfo();
          return {
            pixels,
            wgslErrors: info.messages
              .filter((message) => message.type === "error")
              .map((message) => message.message),
          };
        } finally {
          device.destroy();
        }
      },
      { vertex, fragment: glsl.code, wgsl: wgsl.code, positions },
    );
    expect(results.wgslErrors).toEqual([]);
    for (const [index, pixel] of results.pixels.entries()) {
      const [x, y] = positions[index]!;
      const expected = expectedPixel(x, y, 128);
      for (let channel = 0; channel < 4; channel++) {
        expect(
          Math.abs(pixel[channel]! - expected[channel]!),
          `${x},${y}: rgba[${channel}]`,
        ).toBeLessThanOrEqual(6);
      }
    }
  } finally {
    await browser.close();
  }
}, 60_000);
