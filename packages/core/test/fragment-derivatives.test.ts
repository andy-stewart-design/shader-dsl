import { describe, expect, it } from "vitest";

import {
  compileFragment,
  lowerFragment,
  ShaderDiagnosticCode,
} from "../src/index.js";
import { generateGlslFragment } from "../src/generate-glsl-fragment.js";
import { generateWgslFragment } from "../src/generate-wgsl-fragment.js";
import { chromium } from "playwright";

const operators = ["dFdx", "dFdy", "fwidth"] as const;
const shapes = ["scalar", "vec2", "vec3", "vec4"] as const;
type Shape = (typeof shapes)[number];

function source(
  call: string,
  shape: Shape,
  imports = operators.join(", "),
): string {
  const input =
    shape === "scalar"
      ? "uniforms.time"
      : shape === "vec2"
        ? "coord.xy"
        : shape === "vec3"
          ? "coord.xyz"
          : "coord";
  const result =
    shape === "scalar"
      ? `vec4(${call}, 0, 0, 1)`
      : shape === "vec4"
        ? call
        : `vec4((${call}).x, 0, 0, 1)`;
  return `import { createFragmentShader, vec4, ${imports} } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => { return ${result}; });`;
}

describe("fragment derivatives", () => {
  for (const op of operators) {
    for (const shape of shapes) {
      const call = `${op}(${shape === "scalar" ? "uniforms.time" : shape === "vec2" ? "coord.xy" : shape === "vec3" ? "coord.xyz" : "coord"})`;
      it(`lowers ${op} with ${shape} shape for both targets`, () => {
        for (const target of ["glsl-es-300", "wgsl"] as const) {
          const result = compileFragment(source(call, shape), { target });
          expect(result, `${target} ${call}`).toMatchObject({
            ok: true,
            diagnostics: [],
          });
          if (!result.ok) continue;
          expect(JSON.stringify(result.ir)).toContain(
            `"kind":"builtin-function","name":"${op}"`,
          );
          if (op === "dFdy" && target === "glsl-es-300")
            expect(result.code).toContain("(-dFdy(");
          else if (op === "dFdx" && target === "wgsl")
            expect(result.code).toContain("dpdx(");
          else if (op === "dFdy" && target === "wgsl")
            expect(result.code).toContain("dpdy(");
          else expect(result.code).toContain(`${op}(`);
        }
      });
    }
  }

  it("negates the GLSL derivative result without changing its argument or fwidth", () => {
    const input = `import { createFragmentShader, dFdy, fwidth, vec4 } from "shdr";
export default createFragmentShader(({ coord }) => vec4(dFdy(coord.y - 1), fwidth(coord.y - 1), 0, 1));`;
    const glsl = compileFragment(input, { target: "glsl-es-300" });
    const wgsl = compileFragment(input, { target: "wgsl" });
    expect(glsl).toMatchObject({ ok: true });
    expect(wgsl).toMatchObject({ ok: true });
    if (glsl.ok) {
      expect(glsl.code).toContain("(-dFdy(shdr_coord.y - 1.0))");
      expect(glsl.code).toContain("fwidth(shdr_coord.y - 1.0)");
      expect(glsl.code).not.toContain("dFdy(-(shdr_coord");
    }
    if (wgsl.ok) {
      expect(wgsl.code).toContain("dpdy(shdr_coord.y - 1.0f)");
      expect(wgsl.code).toContain("fwidth(shdr_coord.y - 1.0f)");
    }
  });

  it("does not constant-fold a derivative of a literal into a domain constant", () => {
    const input = `import { createFragmentShader, dFdx, smoothstep, vec4 } from "shdr";
export default createFragmentShader(({ coord }) => vec4(smoothstep(dFdx(0), 0, coord.x), 0, 0, 1));`;
    expect(lowerFragment(input)).toMatchObject({ ok: true, diagnostics: [] });
  });

  it.each([
    ["dFdx(coord.x, coord.y)", ShaderDiagnosticCode.InvalidBuiltin],
    ["dFdy(mat2(1))", ShaderDiagnosticCode.InvalidBuiltin],
    ["fwidth(coord.xy, coord.xy)", ShaderDiagnosticCode.InvalidBuiltin],
  ] as const)(
    "diagnoses invalid call %s at the authored range",
    (call, code) => {
      const imports = call.includes("mat2")
        ? `${operators.join(", ")}, mat2`
        : operators.join(", ");
      const input = source(call, "scalar", imports);
      const result = lowerFragment(input);
      expect(result).toMatchObject({ ok: false });
      if (result.ok) return;
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code,
          range: { start: input.indexOf(call), length: call.length },
        }),
      );
    },
  );

  it("links generated GLSL and validates generated WGSL pipelines for all twelve signatures", async () => {
    const glsl: string[] = [];
    const wgsl: string[] = [];
    for (const op of operators)
      for (const shape of shapes) {
        const arg =
          shape === "scalar"
            ? "uniforms.time"
            : shape === "vec2"
              ? "coord.xy"
              : shape === "vec3"
                ? "coord.xyz"
                : "coord";
        const lowered = lowerFragment(source(`${op}(${arg})`, shape));
        expect(lowered).toMatchObject({ ok: true });
        if (!lowered.ok) continue;
        glsl.push(generateGlslFragment(lowered.ir));
        wgsl.push(generateWgslFragment(lowered.ir));
      }
    const nestedUnary = lowerFragment(source("-dFdy(coord.y)", "scalar"));
    expect(nestedUnary.ok).toBe(true);
    if (nestedUnary.ok) {
      const nestedGlsl = generateGlslFragment(nestedUnary.ir);
      expect(nestedGlsl).toContain("-(-dFdy(");
      glsl.push(nestedGlsl);
      wgsl.push(generateWgslFragment(nestedUnary.ir));
    }
    expect(glsl).toHaveLength(13);
    expect(wgsl).toHaveLength(13);
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
        route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
      );
      await page.goto("http://localhost/");
      const result = await page.evaluate(
        async ({ glslSources, wgslSources }) => {
          const gl = document.createElement("canvas").getContext("webgl2");
          if (!gl) throw new Error("WebGL 2 unavailable");
          const vertexSource = `#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
          const compile = (type: number, text: string) => {
            const shader = gl.createShader(type)!;
            gl.shaderSource(shader, text);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
              throw new Error(
                gl.getShaderInfoLog(shader) ?? "GLSL compile failed",
              );
            return shader;
          };
          for (const fragmentSource of glslSources) {
            const vs = compile(gl.VERTEX_SHADER, vertexSource);
            const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
            const p = gl.createProgram()!;
            gl.attachShader(p, vs);
            gl.attachShader(p, fs);
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS))
              throw new Error(gl.getProgramInfoLog(p) ?? "GLSL link failed");
            gl.deleteProgram(p);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
          }
          const adapter = await navigator.gpu?.requestAdapter();
          if (!adapter) throw new Error("WebGPU adapter unavailable");
          const device = await adapter.requestDevice();
          const vertex = `@vertex fn shdr_test_vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{let p=array<vec2<f32>,3>(vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));return vec4(p[i],0.0,1.0);}`;
          try {
            for (const fragmentSource of wgslSources) {
              const module = device.createShaderModule({
                code: `${vertex}\n${fragmentSource}`,
              });
              const info = await module.getCompilationInfo();
              const errors = info.messages.filter((m) => m.type === "error");
              if (errors.length)
                throw new Error(errors.map((e) => e.message).join("\n"));
              device.createRenderPipeline({
                layout: "auto",
                vertex: { module, entryPoint: "shdr_test_vertex" },
                fragment: {
                  module,
                  entryPoint: "shdr_fragment_main",
                  targets: [{ format: "rgba8unorm" }],
                },
                primitive: { topology: "triangle-list" },
              });
            }
          } finally {
            device.destroy();
          }
          return { glsl: glslSources.length, wgsl: wgslSources.length };
        },
        { glslSources: glsl, wgslSources: wgsl },
      );
      expect(result).toEqual({ glsl: 13, wgsl: 13 });
    } finally {
      await browser.close();
    }
  }, 60_000);

  it("rejects texture handles at the derivative call", () => {
    const input = `import { createFragmentShader, defineUniforms, dFdx, vec4 } from "shdr";
const uniforms = defineUniforms((u) => ({ photo: u.texture2D("/photo.png") }));
export default createFragmentShader(({ uniforms }) => vec4(dFdx(uniforms.photo), 0, 0, 1), { uniforms });`;
    const result = lowerFragment(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const call = "dFdx(uniforms.photo)";
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: ShaderDiagnosticCode.InvalidBuiltin,
      range: { start: input.indexOf(call), length: call.length },
    }));
  });

  it("requires direct named imports", () => {
    const input = source("dFdx(coord.x)", "scalar", "dFdy, fwidth");
    expect(lowerFragment(input)).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: ShaderDiagnosticCode.UnsupportedCall }),
      ],
    });
  });
});
