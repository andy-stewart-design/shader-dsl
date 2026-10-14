import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { compileFragmentArtifact } from "../src/compile-fragment-artifact.js";
import { lowerFragment } from "../src/lower-fragment.js";
import { createVirtualSource } from "../src/create-virtual-source.js";

const declaration = `defineUniforms((u) => ({ color: u.vec3(0, 0, 1), dpi: u.f32(12), unused: u.vec2(-1, 0.1) }))`;
const body = `({ uniforms }) => vec4(uniforms.color.x, uniforms.color.y, uniforms.dpi, 1)`;
const imports = `import { createFragmentShader, defineUniforms, vec4 } from "shdr";\n`;
const inline = `${imports}export default ${declaration}.createFragmentShader(${body});`;
const named = `${imports}const uniforms = ${declaration};\nexport default createFragmentShader(${body}, { uniforms });`;
const textureDeclaration = `defineUniforms((u) => ({ photo: u.texture2D("/photo.png"), remote: u.texture2D("https://cdn.example/photo.png"), gain: u.f32(0.5) }))`;
const textureBody = `({ uniforms }) => vec4(uniforms.gain, uniforms.gain, uniforms.gain, 1)`;
const textureInline = `${imports}export default ${textureDeclaration}.createFragmentShader(${textureBody});`;
const textureNamed = `${imports}const uniforms = ${textureDeclaration};\nexport default createFragmentShader(${textureBody}, { uniforms });`;
const sampled = `import { defineUniforms, sample } from "shdr";
export default defineUniforms((u) => ({ photo: u.texture2D("/photo.png"), gain: u.f32(0.5) }))
.createFragmentShader(({ coord, uniforms }) => {
  const photo = uniforms.photo;
  const second = photo;
  return sample(second, coord.xy / uniforms.resolution);
});`;

function compile(source: string) {
  const compiled = compileFragmentArtifact(source);
  expect(compiled.ok, JSON.stringify(compiled.diagnostics)).toBe(true);
  if (!compiled.ok) throw new Error("Unexpected Shdr diagnostic");
  return compiled.artifact;
}

describe("custom uniform compilation", () => {
  it("normalizes both authoring forms into one artifact and target-neutral IR", () => {
    const artifact = compile(inline);
    expect(compile(named)).toEqual(artifact);
    expect(artifact.custom).toEqual({
      declarations: [
        { name: "color", type: "vec3", default: [0, 0, 1] },
        { name: "dpi", type: "f32", default: 12 },
        { name: "unused", type: "vec2", default: [-1, 0.1] },
      ],
      referenced: { glsl: ["color", "dpi"], wgsl: ["color", "dpi"] },
    });
    expect(artifact.defaults).toEqual({ glsl: [], wgsl: [] });
    expect(artifact.glsl).toContain("uniform vec3 shdr_custom_0;");
    expect(artifact.glsl).toContain("uniform float shdr_custom_1;");
    expect(artifact.glsl).not.toContain("uniform vec2 shdr_custom_2;");
    expect(artifact.wgsl).toContain(
      "@group(1) @binding(0) var<uniform> shdr_custom: ShdrCustomUniforms;",
    );
    expect(artifact.wgsl).toContain("shdr_custom_2: vec2<f32>");
    const lowered = lowerFragment(inline);
    expect(lowered.ok).toBe(true);
    if (lowered.ok) {
      expect(lowered.ir.customUniforms).toEqual(artifact.custom?.declarations);
      expect(JSON.stringify(lowered.ir)).not.toMatch(/glsl|wgsl|binding|group/);
    }
  });

  it("retains texture declarations as separate JSON resource metadata", () => {
    const artifact = compile(textureInline);
    expect(compile(textureNamed)).toEqual(artifact);
    const imported = compileFragmentArtifact({
      entry: "/work/entry.shdr.ts",
      files: {
        "/work/entry.shdr.ts": `${imports}import { uniforms } from "./schema.shdr.ts";\nexport default createFragmentShader(${textureBody}, { uniforms });`,
        "/work/schema.shdr.ts": `import { defineUniforms } from "shdr";\nexport const uniforms = ${textureDeclaration};`,
      },
    });
    expect(imported).toEqual({ ok: true, artifact, diagnostics: [] });
    expect(artifact.custom).toEqual({
      declarations: [{ name: "gain", type: "f32", default: 0.5 }],
      referenced: { glsl: ["gain"], wgsl: ["gain"] },
    });
    expect(artifact.resources).toEqual({
      textures: [
        {
          name: "photo",
          type: "texture2D",
          url: "/photo.png",
          urlKind: "root-absolute",
        },
        {
          name: "remote",
          type: "texture2D",
          url: "https://cdn.example/photo.png",
          urlKind: "https",
        },
      ],
      referenced: { glsl: [], wgsl: [] },
      bindings: { glsl: [], wgsl: [] },
    });
    expect(artifact.glsl).not.toContain("photo");
    expect(artifact.wgsl).not.toContain("remote");
    expect(JSON.parse(JSON.stringify(artifact))).toEqual(artifact);
    const lowered = lowerFragment(textureInline);
    expect(lowered.ok).toBe(true);
    if (lowered.ok) {
      expect(lowered.ir.customUniforms).toEqual([
        { name: "gain", type: "f32", default: 0.5 },
      ]);
      expect(lowered.ir.textures).toEqual(artifact.resources?.textures);
    }
  });

  it("lowers direct sample calls with target-specific resource metadata", () => {
    const artifact = compile(sampled);
    const imported = compileFragmentArtifact({
      entry: "/work/entry.shdr.ts",
      files: {
        "/work/entry.shdr.ts": `import { createFragmentShader, sample } from "shdr";
import { uniforms } from "./schema.shdr.ts";
export default createFragmentShader(({ coord, uniforms }) => sample(uniforms.photo, coord.xy / uniforms.resolution), { uniforms });`,
        "/work/schema.shdr.ts": `import { defineUniforms } from "shdr";
export const uniforms = defineUniforms((u) => ({ photo: u.texture2D("/photo.png") }));`,
      },
    });
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.artifact.resources).toEqual(artifact.resources);
      expect(imported.artifact.glsl).toContain("texture(shdr_texture_0,");
    }
    expect(artifact.resources).toEqual({
      textures: [
        {
          name: "photo",
          type: "texture2D",
          url: "/photo.png",
          urlKind: "root-absolute",
        },
      ],
      referenced: { glsl: ["photo"], wgsl: ["photo"] },
      bindings: {
        glsl: [{ name: "photo", binding: 0 }],
        wgsl: [{ name: "photo", binding: 0 }],
      },
    });
    expect(artifact.glsl).toContain("uniform sampler2D shdr_texture_0;");
    expect(artifact.glsl).toContain("texture(shdr_texture_0,");
    expect(artifact.wgsl).toContain(
      "@group(2) @binding(0) var shdr_texture_0: texture_2d<f32>;",
    );
    expect(artifact.wgsl).toContain(
      "textureSample(shdr_texture_0, shdr_sampler_0,",
    );
  });

  it("allows helpers to compute UVs but rejects texture captures", () => {
    const helper = `import { defineShaderFunction, defineUniforms, sample } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";
const uv = defineShaderFunction((value: Expr<Vec2<F32>>) => value / 2);
export default defineUniforms((u) => ({ photo: u.texture2D("/photo.png") }))
.createFragmentShader(({ coord, uniforms }) => sample(uniforms.photo, uv(coord.xy)));`;
    const artifact = compile(helper);
    expect(artifact.resources?.referenced).toEqual({
      glsl: ["photo"],
      wgsl: ["photo"],
    });
    const captured = helper.replace(
      "(value: Expr<Vec2<F32>>) => value / 2",
      "(value: Expr<Vec2<F32>>) => sample(uniforms.photo, value)",
    );
    const result = compileFragmentArtifact(captured);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe("SHDR1108");
  });

  it("rejects invalid sample calls at authored ranges", () => {
    const cases = [
      [
        sampled.replace("sample(second,", "sample(second, coord.xy, "),
        "sample",
      ],
      [
        sampled.replace("coord.xy / uniforms.resolution", "uniforms.gain"),
        "uniforms.gain",
      ],
      [
        sampled.replace("sample(second,", "sample(uniforms.missing,"),
        "missing",
      ],
      [sampled.replace("defineUniforms, sample", "defineUniforms"), "sample"],
    ] as const;
    for (const [source, token] of cases) {
      const result = compileFragmentArtifact(source);
      expect(result.ok, token).toBe(false);
      if (result.ok) continue;
      expect(
        source.slice(
          result.diagnostics[0]!.range.start,
          result.diagnostics[0]!.range.start +
            result.diagnostics[0]!.range.length,
        ),
      ).toContain(token);
    }
  });

  it("rejects malformed, dynamic, duplicate, and reserved texture declarations", () => {
    const cases = [
      [textureInline.replace('"/photo.png"', "window.photo"), "window.photo"],
      [textureInline.replace('"/photo.png"', '"photo.png"'), '"photo.png"'],
      [
        textureInline.replace('"/photo.png"', '"http://cdn.example/a.png"'),
        '"http://cdn.example/a.png"',
      ],
      [
        textureInline.replace('"/photo.png"', '"//cdn.example/a.png"'),
        '"//cdn.example/a.png"',
      ],
      [
        textureInline.replace("photo: u.texture2D", "gain: u.texture2D"),
        "gain",
      ],
      [
        textureInline.replace("photo: u.texture2D", "time: u.texture2D"),
        "time",
      ],
      [
        textureInline.replace('u.texture2D("/photo.png")', "u.texture2D(1)"),
        "1",
      ],
    ] as const;
    for (const [source, token] of cases) {
      const result = compileFragmentArtifact(source);
      expect(result.ok, token).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostics[0]?.code).toBe("SHDR1210");
      const range = result.diagnostics[0]!.range;
      expect(source.slice(range.start, range.start + range.length)).toContain(
        token,
      );
    }
  });

  it("rejects a texture declaration used as a numeric expression", () => {
    const result = compileFragmentArtifact(
      textureInline.replace(
        "uniforms.gain, uniforms.gain, uniforms.gain",
        "uniforms.photo, uniforms.gain, uniforms.gain",
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe("SHDR1203");
      expect(result.diagnostics[0]?.message).toContain('"photo"');
    }
  });

  it("covers every f32/vector declaration and keeps automatic bindings independent", () => {
    const source = `import { defineUniforms, vec4 } from "shdr";
export default defineUniforms((u) => ({ s: u.f32(-0), v2: u.vec2(-2, 0.1), v3: u.vec3(0, 1, 2), v4: u.vec4(1, 2, 3, 4) }))
.createFragmentShader(({ coord, uniforms }) => vec4(uniforms.v2.x, uniforms.v3.z, uniforms.v4.w, uniforms.s));`;
    const artifact = compile(source);
    expect(artifact.custom?.declarations).toEqual([
      { name: "s", type: "f32", default: 0 },
      { name: "v2", type: "vec2", default: [-2, 0.1] },
      { name: "v3", type: "vec3", default: [0, 1, 2] },
      { name: "v4", type: "vec4", default: [1, 2, 3, 4] },
    ]);
    expect(JSON.parse(JSON.stringify(artifact))).toEqual(artifact);
    expect(artifact.custom?.referenced.wgsl).toEqual(["s", "v2", "v3", "v4"]);
    expect(artifact.defaults).toEqual({ glsl: [], wgsl: [] });
    const position = compile(source.replace("uniforms.s));", "coord.x));"));
    expect(position.defaults).toEqual({ glsl: ["resolution"], wgsl: [] });
  });

  it("retains all declarations even when none are referenced", () => {
    const artifact = compile(
      inline.replace(body, "({ uniforms }) => vec4(0, 0, 0, 1)"),
    );
    expect(artifact.custom?.referenced).toEqual({ glsl: [], wgsl: [] });
    expect(artifact.glsl).not.toContain("shdr_custom_0");
    expect(artifact.wgsl).not.toContain("@group(1)");
  });

  it("diagnoses invalid defaults, links and names at original source ranges", () => {
    const cases = [
      [
        inline.replace("u.f32(12)", "u.f32(window.devicePixelRatio)"),
        "window.devicePixelRatio",
      ],
      [inline.replace("u.vec3(0, 0, 1)", "u.vec3(0, 1)"), "u.vec3(0, 1)"],
      [inline.replace("u.f32(12)", "u.f32(1e300)"), "1e300"],
      [inline.replace("u.f32(12)", "u.f32(3.4028235e38)"), "3.4028235e38"],
      [inline.replace("u.f32(12)", "u.f32(1 + 2)"), "1 + 2"],
      [inline.replace("color: u.vec3", "__proto__: u.vec3"), "__proto__"],
      [inline.replace("color: u.vec3", "time: u.vec3"), "time"],
      [inline.replace("dpi: u.f32", "color: u.f32"), "color"],
      [
        named.replace("{ uniforms });", "{ uniforms: other });"),
        "{ uniforms: other }",
      ],
    ] as const;
    for (const [source, token] of cases) {
      const result = compileFragmentArtifact(source);
      expect(result.ok, token).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostics[0]?.code).toBe("SHDR1210");
      const range = result.diagnostics[0]!.range;
      expect(source.slice(range.start, range.start + range.length)).toContain(
        token,
      );
    }
  });

  it("accepts the largest finite f32 and an underflowed custom default", () => {
    const artifact = compile(
      inline
        .replace("u.f32(12)", "u.f32(3.4028234663852886e38)")
        .replace("u.vec2(-1, 0.1)", "u.vec2(-1, 1e-50)"),
    );
    expect(artifact.custom?.declarations[1]?.default).toBe(
      3.4028234663852886e38,
    );
    expect(artifact.custom?.declarations[2]?.default).toEqual([-1, 1e-50]);
  });

  it("does not permit undeclared callback bindings or arbitrary captures", () => {
    const unboundCoord = inline.replace(
      "uniforms.dpi, 1)",
      "uniforms.dpi, coord.x)",
    );
    const result = compileFragmentArtifact(unboundCoord);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe("SHDR1108");
    const unknown = compileFragmentArtifact(
      inline.replace("uniforms.dpi, 1)", "uniforms.missing, 1)"),
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.diagnostics[0]?.code).toBe("SHDR1203");
      expect(unknown.diagnostics[0]?.message).toContain('"missing"');
    }
  });

  it("browser-compiles both generated targets and finite numeric boundary literals", async () => {
    const artifacts = [
      compile(inline),
      compile(sampled),
      compile(`import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => vec4(3.4028234663852886e38, 1e-50, 0, 1));`),
    ];
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
      const result = await page.evaluate(async (artifacts) => {
        const gl = document.querySelector("canvas")?.getContext("webgl2");
        if (!gl) throw new Error("WebGL 2 unavailable");
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        try {
          const results = [];
          for (const { glsl, wgsl } of artifacts) {
            const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
            gl.shaderSource(shader, glsl);
            gl.compileShader(shader);
            const glslError = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
              ? null
              : gl.getShaderInfoLog(shader);
            let glslLinkError = null;
            if (!glslError) {
              const vertex = gl.createShader(gl.VERTEX_SHADER)!;
              gl.shaderSource(
                vertex,
                `#version 300 es
                void main() {
                  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
                  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
                }`,
              );
              gl.compileShader(vertex);
              if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS)) {
                glslLinkError = gl.getShaderInfoLog(vertex);
              } else {
                const program = gl.createProgram()!;
                gl.attachShader(program, vertex);
                gl.attachShader(program, shader);
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS))
                  glslLinkError = gl.getProgramInfoLog(program);
                gl.deleteProgram(program);
              }
              gl.deleteShader(vertex);
            }
            gl.deleteShader(shader);
            const module = device.createShaderModule({ code: wgsl });
            const info = await module.getCompilationInfo();
            const wgslErrors = info.messages
              .filter((message) => message.type === "error")
              .map((message) => message.message);
            let wgslPipelineError = null;
            if (!wgslErrors.length) {
              try {
                await device.createRenderPipelineAsync({
                  layout: "auto",
                  vertex: {
                    module: device.createShaderModule({
                      code: `@vertex
                      fn main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
                        let vertices = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
                        return vec4<f32>(vertices[index], 0.0, 1.0);
                      }`,
                    }),
                    entryPoint: "main",
                  },
                  fragment: {
                    module,
                    entryPoint: "shdr_fragment_main",
                    targets: [
                      { format: navigator.gpu.getPreferredCanvasFormat() },
                    ],
                  },
                  primitive: { topology: "triangle-list" },
                });
              } catch (error) {
                wgslPipelineError = String(error);
              }
            }
            results.push({
              glslError,
              glslLinkError,
              wgslErrors,
              wgslPipelineError,
            });
          }
          return results;
        } finally {
          device.destroy();
        }
      }, artifacts);
      expect(result).toEqual(
        artifacts.map(() => ({
          glslError: null,
          glslLinkError: null,
          wgslErrors: [],
          wgslPipelineError: null,
        })),
      );
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("transforms expression-bodied callbacks in the virtual TS source without touching defaults", () => {
    const result = createVirtualSource(inline);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.virtualSource.code).toContain("__shdr_internal_f32(1)");
    expect(result.virtualSource.code).toContain("u.f32(12)");
  });
});
