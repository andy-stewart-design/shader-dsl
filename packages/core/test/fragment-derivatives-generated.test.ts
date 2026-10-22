import { chromium } from "playwright";
import { expect, it } from "vitest";

import { compileFragmentArtifact } from "../src/browser.js";
import type { ShaderVirtualGraphInput } from "../src/index.js";

const input: ShaderVirtualGraphInput = {
  entry: "/work/scene.shdr.ts",
  files: {
    "/work/scene.shdr.ts": `import { createFragmentShader, vec4 } from "shdr";
import { shade } from "./helper.shdr.ts";
export default createFragmentShader(({ coord }) => vec4(shade(coord.xy), 0, 0, 1));`,
    "/work/helper.shdr.ts": `import { defineShaderFunction, dFdx, dFdy, fwidth } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";
import { inner } from "./inner.shdr.ts";
export const shade = defineShaderFunction((p: Expr<Vec2<F32>>) => inner(p));`,
    "/work/inner.shdr.ts": `import { defineShaderFunction, dFdx, dFdy, fwidth } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";
export const inner = defineShaderFunction((p: Expr<Vec2<F32>>) => dFdx(p.x) + dFdy(p.y) + fwidth(p.x));`,
  },
};

it("links imported-helper GLSL and validates the generated WGSL render pipeline", async () => {
  const result = compileFragmentArtifact(input);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) return;
  const browser = await chromium.launch({ headless: true, args: [
    "--enable-webgl", "--enable-unsafe-swiftshader", "--enable-unsafe-webgpu", "--use-angle=swiftshader",
  ] });
  try {
    const page = await browser.newPage();
    await page.route("http://localhost/", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><canvas></canvas>" }));
    await page.goto("http://localhost/");
    const validation = await page.evaluate(async artifact => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2");
      if (!gl) throw new Error("WebGL 2 unavailable");
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "GLSL compile failed");
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, `#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`);
      const fragment = compile(gl.FRAGMENT_SHADER, artifact.glsl);
      const program = gl.createProgram()!; gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "GLSL link failed");
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      try {
        const vertexWgsl = `@vertex fn shdr_test_vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{let p=array<vec2<f32>,3>(vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));return vec4(p[i],0.0,1.0);}`;
        const module = device.createShaderModule({ code: `${vertexWgsl}\n${artifact.wgsl}` });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(message => message.type === "error").map(message => message.message);
        if (errors.length) throw new Error(errors.join("\n"));
        device.createRenderPipeline({ layout: "auto", vertex: { module, entryPoint: "shdr_test_vertex" }, fragment: { module, entryPoint: "shdr_fragment_main", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } });
        return { glslLinked: true, wgslPipelineValidated: true, adapter: adapter.info?.description ?? "unknown" };
      } finally { device.destroy(); }
    }, result.artifact);
    expect(validation.glslLinked).toBe(true);
    expect(validation.wgslPipelineValidated).toBe(true);
  } finally { await browser.close(); }
}, 60_000);
