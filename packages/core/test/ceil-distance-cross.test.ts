import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

import {
  compileFragment,
  lowerFragment,
  ShaderDiagnosticCode,
} from "../src/index.js";

const cases = [
  ["ceil(s)", "s"],
  ["ceil(v2)", "v2"],
  ["ceil(v3)", "v3"],
  ["ceil(v4)", "v4"],
  ["distance(s, s)", "s"],
  ["distance(v2, v2)", "s"],
  ["distance(v3, v3)", "s"],
  ["distance(v4, v4)", "s"],
  ["cross(v3, v3)", "v3"],
] as const;

type Shape = (typeof cases)[number][1];

function source(call: string, shape: Shape): string {
  const result = shape === "s" ? call : `(${call}).x`;
  return `import { createFragmentShader, vec2, vec3, vec4, ceil, distance, cross } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  return vec4(${result}, 0, 0, 1);
});`;
}

const integrated = `import { createFragmentShader, vec2, vec3, vec4, ceil, distance, cross } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const rounded = ceil(-1.25);
  return vec4(
    rounded + 1,
    distance(vec2(3, 4), vec2(0)) / 10,
    cross(vec3(1, 0, 0), vec3(0, 1, 0)).z,
    1,
  );
});`;

const vertex = `#version 300 es
precision highp float;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;

describe("ceil, distance and cross f32 common subset", () => {
  it("keeps all nine signatures in target-neutral IR and both emitters", () => {
    expect(cases).toHaveLength(9);
    for (const [call, shape] of cases) {
      const glsl = compileFragment(source(call, shape), {
        target: "glsl-es-300",
      });
      const wgsl = compileFragment(source(call, shape), { target: "wgsl" });
      expect(glsl, call).toMatchObject({ ok: true, diagnostics: [] });
      expect(wgsl, call).toMatchObject({ ok: true, diagnostics: [] });
      if (!glsl.ok || !wgsl.ok) continue;
      expect(glsl.ir).toEqual(wgsl.ir);
      expect(glsl.code).toContain(`${call.slice(0, call.indexOf("("))}(`);
      expect(wgsl.code).toContain(`${call.slice(0, call.indexOf("("))}(`);
      expect(JSON.stringify(glsl.ir)).toContain(
        `"kind":"builtin-function","name":"${call.slice(0, call.indexOf("("))}"`,
      );
    }
  });

  for (const call of [
    "ceil(s, s)",
    "distance(s, v2)",
    "distance(v2, v3)",
    "distance(v3)",
    "cross(s, s)",
    "cross(v2, v2)",
    "cross(v4, v4)",
    "cross(v3, v2)",
  ]) {
    it(`reports ${call} over the original call`, () => {
      const text = source(call, "s");
      expect(lowerFragment(text)).toMatchObject({
        ok: false,
        diagnostics: [
          {
            code: ShaderDiagnosticCode.InvalidBuiltin,
            range: { start: text.indexOf(call), length: call.length },
          },
        ],
      });
    });
  }

  it("recognizes constant ceil results in equal-edge smoothstep diagnostics", () => {
    const text = source("smoothstep(ceil(-1.25), -1, s)", "s").replace(
      "ceil, distance, cross }",
      "ceil, distance, cross, smoothstep }",
    );
    expect(lowerFragment(text)).toMatchObject({
      ok: false,
      diagnostics: [{ code: ShaderDiagnosticCode.InvalidBuiltinDomain }],
    });
  });

  it("compiles all nine generated shapes in WebGL 2 and WebGPU and renders finite pixels", async () => {
    const shaders = cases.map(([call, shape]) => {
      const text = source(call, shape);
      const glsl = compileFragment(text, { target: "glsl-es-300" });
      const wgsl = compileFragment(text, { target: "wgsl" });
      if (!glsl.ok || !wgsl.ok) throw new Error(`${call}: compilation failed`);
      return { glsl: glsl.code, wgsl: wgsl.code };
    });
    const glsl = compileFragment(integrated, { target: "glsl-es-300" });
    const wgsl = compileFragment(integrated, { target: "wgsl" });
    expect(glsl).toMatchObject({ ok: true, diagnostics: [] });
    expect(wgsl).toMatchObject({ ok: true, diagnostics: [] });
    if (!glsl.ok || !wgsl.ok) return;
    expect(glsl.ir).toEqual(wgsl.ir);

    const browser = await chromium.launch({
      headless: true,
      args: [
        "--enable-webgl",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--enable-unsafe-webgpu",
      ],
    });
    try {
      const page = await browser.newPage();
      await page.route("http://localhost/", (route) =>
        route.fulfill({ body: "<!doctype html>" }),
      );
      await page.goto("http://localhost/");
      const result = await page.evaluate(
        async ({ shaders, vertex, fragment, wgsl }) => {
          const gl = document
            .createElement("canvas")
            .getContext("webgl2", { preserveDrawingBuffer: true });
          if (!gl) throw new Error("WebGL 2 unavailable");
          const compile = (kind: number, code: string): WebGLShader => {
            const shader = gl.createShader(kind)!;
            gl.shaderSource(shader, code);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
              throw new Error(
                gl.getShaderInfoLog(shader) ?? "GLSL compilation failed",
              );
            }
            return shader;
          };
          for (const { glsl: text } of shaders)
            gl.deleteShader(compile(gl.FRAGMENT_SHADER, text));
          const program = gl.createProgram()!;
          const vertexShader = compile(gl.VERTEX_SHADER, vertex);
          const fragmentShader = compile(gl.FRAGMENT_SHADER, fragment);
          gl.attachShader(program, vertexShader);
          gl.attachShader(program, fragmentShader);
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(
              gl.getProgramInfoLog(program) ?? "GLSL link failed",
            );
          }
          gl.useProgram(program);
          gl.viewport(0, 0, 1, 1);
          gl.bindVertexArray(gl.createVertexArray());
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const pixel = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          gl.deleteProgram(program);
          gl.deleteShader(vertexShader);
          gl.deleteShader(fragmentShader);

          const adapter = await navigator.gpu?.requestAdapter();
          if (!adapter) throw new Error("WebGPU adapter unavailable");
          const device = await adapter.requestDevice();
          try {
            const wgslErrors: string[][] = [];
            for (const code of [
              ...shaders.map((shader) => shader.wgsl),
              wgsl,
            ]) {
              const info = await device
                .createShaderModule({ code })
                .getCompilationInfo();
              wgslErrors.push(
                info.messages
                  .filter((message) => message.type === "error")
                  .map((message) => message.message),
              );
            }
            return { pixel: [...pixel], wgslErrors };
          } finally {
            device.destroy();
          }
        },
        { shaders, vertex, fragment: glsl.code, wgsl: wgsl.code },
      );
      expect(result.wgslErrors).toEqual(
        shaders.concat({ glsl: glsl.code, wgsl: wgsl.code }).map(() => []),
      );
      expect(result.pixel).toEqual([0, 128, 255, 255]);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
