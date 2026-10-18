import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { compileFragmentArtifact } from "../src/browser.js";
import { lowerFragment } from "../src/index.js";

const localSource = `import { createFragmentShader, defineShaderFunction, mat2, mat3, mat4, vec4 } from "shdr";
import type { Expr, F32, Mat2, Mat3, Mat4 } from "shdr";
const make2 = defineShaderFunction((value: Expr<F32>) => mat2(value));
const copy2 = defineShaderFunction((value: Expr<Mat2<F32>>): Expr<Mat2<F32>> => mat2(value));
const make3 = defineShaderFunction((value: Expr<F32>): Expr<Mat3<F32>> => mat3(value));
const copy3 = defineShaderFunction((value: Expr<Mat3<F32>>) => mat3(value));
const make4 = defineShaderFunction((value: Expr<F32>) => mat4(value));
const copy4 = defineShaderFunction((value: Expr<Mat4<F32>>): Expr<Mat4<F32>> => value);
export default createFragmentShader(({ uniforms }) => {
  const m2 = make2(uniforms.time);
  const m3 = make3(uniforms.time);
  const m4 = make4(uniforms.time);
  const c2 = copy2(m2);
  const c3 = copy3(m3);
  const c4 = copy4(m4);
  return vec4(1);
});`;

function importedGraph() {
  return {
    entry: "/work/scene.shdr.ts",
    files: {
      "/work/scene.shdr.ts": `import { createFragmentShader, mat2, mat3, vec4 } from "shdr";
import { diagonal2, diagonal3, copy3, diagonal4 } from "./matrices.shdr.ts";
export default createFragmentShader(({ uniforms }) => {
  const matrix2 = diagonal2(uniforms.time);
  const matrix3 = copy3(diagonal3(uniforms.time));
  const matrix4 = diagonal4(uniforms.time);
  return vec4(1);
});`,
      "/work/matrices.shdr.ts": `import { defineShaderFunction, mat2, mat3, mat4 } from "shdr";
import type { Expr, F32, Mat2, Mat3 } from "shdr";
export const diagonal2 = defineShaderFunction((value: Expr<F32>) => mat2(value));
export const diagonal3 = defineShaderFunction((value: Expr<F32>) => mat3(value));
export const copy3 = defineShaderFunction((value: Expr<Mat3<F32>>): Expr<Mat3<F32>> => mat3(value));
export const diagonal4 = defineShaderFunction((value: Expr<F32>) => mat4(value));`,
    },
  };
}

async function compileTargets(glsl: string, wgsl: string) {
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
    return await page.evaluate(
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
  } finally {
    await browser.close();
  }
}

describe("square matrix helper boundaries", () => {
  it("preserves local matrix parameters and inferred or annotated returns", async () => {
    const result = lowerFragment(localSource);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.ir.functions?.map((helper) => helper.returnType)).toEqual([
      { kind: "matrix", scalar: "f32", columns: 2, rows: 2 },
      { kind: "matrix", scalar: "f32", columns: 2, rows: 2 },
      { kind: "matrix", scalar: "f32", columns: 3, rows: 3 },
      { kind: "matrix", scalar: "f32", columns: 3, rows: 3 },
      { kind: "matrix", scalar: "f32", columns: 4, rows: 4 },
      { kind: "matrix", scalar: "f32", columns: 4, rows: 4 },
    ]);
    const artifact = compileFragmentArtifact(localSource);
    expect(artifact.ok, JSON.stringify(artifact)).toBe(true);
    if (!artifact.ok) return;
    expect(artifact.artifact.glsl).toContain(
      "mat2 shdr_internal_fn_0(float value)",
    );
    expect(artifact.artifact.wgsl).toContain(
      "fn shdr_internal_fn_0(value: f32) -> mat2x2<f32>",
    );
    expect(artifact.artifact.wgsl).toContain(
      "fn shdr_internal_mat2(value: f32) -> mat2x2<f32>",
    );
    expect(
      artifact.artifact.glsl.match(/shdr_internal_mat[234]\(value\)/g),
    ).toHaveLength(3);
    expect(
      artifact.artifact.wgsl.match(/shdr_internal_mat[234]\(value\)/g),
    ).toHaveLength(3);
    expect(
      await compileTargets(artifact.artifact.glsl, artifact.artifact.wgsl),
    ).toEqual({
      glslError: null,
      wgslErrors: [],
    });
  }, 60_000);

  it("supports named imported matrix helpers and reports changed sizes at source boundaries", () => {
    const result = compileFragmentArtifact(importedGraph());
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.glsl).toContain("mat3 shdr_internal_fn_");
    expect(result.artifact.wgsl).toContain("mat3x3<f32>");

    const changedArgument = importedGraph();
    changedArgument.files["/work/scene.shdr.ts"] = changedArgument.files[
      "/work/scene.shdr.ts"
    ].replace("copy3(diagonal3(uniforms.time))", "copy3(mat2(1))");
    const invalidArgument = compileFragmentArtifact(changedArgument);
    expect(invalidArgument.ok).toBe(false);
    if (!invalidArgument.ok)
      expect(invalidArgument.diagnostics[0]).toMatchObject({
        code: "SHDR1213",
        fileName: "/work/scene.shdr.ts",
        range: {
          start:
            changedArgument.files["/work/scene.shdr.ts"].indexOf(
              "copy3(mat2(1))",
            ),
          length: "copy3(mat2(1))".length,
        },
      });

    const changedReturn = importedGraph();
    changedReturn.files["/work/matrices.shdr.ts"] = changedReturn.files[
      "/work/matrices.shdr.ts"
    ].replace(
      "Expr<Mat3<F32>> => mat3(value)",
      "Expr<Mat2<F32>> => mat3(value)",
    );
    const invalidReturn = compileFragmentArtifact(changedReturn);
    expect(invalidReturn.ok).toBe(false);
    if (!invalidReturn.ok)
      expect(invalidReturn.diagnostics[0]).toMatchObject({
        code: "SHDR1207",
        fileName: "/work/matrices.shdr.ts",
        range: {
          start:
            changedReturn.files["/work/matrices.shdr.ts"].lastIndexOf(
              "mat3(value)",
            ),
          length: "mat3(value)".length,
        },
      });
  });
});
