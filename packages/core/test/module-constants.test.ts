import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

import { compileFragmentArtifact } from "../src/compile-fragment-artifact.js";
import {
  checkShaderGraph,
  compileFragment,
  lowerFragment,
  parseModuleConstants,
  parseShaderFile,
  ShaderDiagnosticCode,
  type ModuleConstantReference,
} from "../src/index.js";

function reference(
  source: string,
  name: string,
  from = 0,
): ModuleConstantReference {
  const start =
    from === 0 ? source.lastIndexOf(name) : source.indexOf(name, from);
  expect(start).toBeGreaterThanOrEqual(0);
  return { name, range: { start, length: name.length } };
}

function diagnosticText(
  source: string,
  range: { start: number; length: number },
): string {
  return source.slice(range.start, range.start + range.length);
}

describe("parseModuleConstants", () => {
  it("admits eligible references into fragment lowering without host evaluation", () => {
    const source = `import { createFragmentShader, vec2, vec3, vec4 } from "shdr";
const RADIUS = 0.1;
const CENTER = vec2(0, RADIUS);
const TINT = vec3(CENTER, RADIUS);
const UNUSED = computeColor();
export default createFragmentShader(({ coord }) =>
  vec4(coord.x * RADIUS, CENTER.x, TINT.z, 1),
);
`;
    const parsed = parseShaderFile(source, "module-constants.shdr.ts");
    expect(parsed.diagnostics).toEqual([]);
    expect([...parsed.info!.moduleConstants!.keys()].sort()).toEqual([
      "CENTER",
      "RADIUS",
      "TINT",
    ]);

    const lowered = lowerFragment(source);
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;

    const artifact = compileFragmentArtifact(source);
    expect(artifact.ok).toBe(true);
    if (!artifact.ok) return;
    expect(artifact.artifact.defaults).toEqual({
      glsl: ["resolution"],
      wgsl: [],
    });
    expect(artifact.artifact.custom).toBeUndefined();
    expect(artifact.artifact.resources).toBeUndefined();

    const glsl = compileFragment(source, { target: "glsl-es-300" });
    const wgsl = compileFragment(source, { target: "wgsl" });
    expect(glsl.ok).toBe(true);
    expect(wgsl.ok).toBe(true);
    if (!glsl.ok || !wgsl.ok) return;
    expect(glsl.code).not.toContain("RADIUS");
    expect(glsl.code).not.toContain("CENTER");
    expect(wgsl.code).not.toContain("RADIUS");
    expect(wgsl.code).not.toContain("CENTER");

    const signedZero = `import { createFragmentShader, vec4 } from "shdr";
const ZERO = -0;
export default createFragmentShader(() => vec4(ZERO, 0, 0, 1));
`;
    const signedGlsl = compileFragment(signedZero, {
      target: "glsl-es-300",
    });
    const signedWgsl = compileFragment(signedZero, { target: "wgsl" });
    expect(signedGlsl.ok).toBe(true);
    expect(signedWgsl.ok).toBe(true);
    if (signedGlsl.ok) expect(signedGlsl.code).toContain("-0.0");
    if (signedWgsl.ok) expect(signedWgsl.code).toContain("-0.0f");
  });

  it("compiles generated constants on real WebGL 2 and WebGPU targets", async () => {
    const source = `import { createFragmentShader, vec4 } from "shdr";
const RADIUS = 0.1;
export default createFragmentShader(({ coord }) =>
  vec4(coord.x * RADIUS, RADIUS, 0, 1),
);
`;
    const glsl = compileFragment(source, { target: "glsl-es-300" });
    const wgsl = compileFragment(source, { target: "wgsl" });
    expect(glsl.ok).toBe(true);
    expect(wgsl.ok).toBe(true);
    if (!glsl.ok || !wgsl.ok) return;

    const browser = await chromium.launch({
      headless: process.env.SHDR_WEBGL_HEADED !== "1",
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
        async ({ glslSource, wgslSource }) => {
          const canvas = document.querySelector("canvas");
          const gl = canvas?.getContext("webgl2");
          if (!gl) return { webgl: false, webgpu: false };
          const vertexSource = `#version 300 es
precision highp float;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;
          const compile = (
            type: typeof gl.VERTEX_SHADER | typeof gl.FRAGMENT_SHADER,
            code: string,
          ) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, code);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
              gl.deleteShader(shader);
              return null;
            }
            return shader;
          };
          const vertex = compile(gl.VERTEX_SHADER, vertexSource);
          const fragment = compile(gl.FRAGMENT_SHADER, glslSource);
          let webgl = false;
          if (vertex && fragment) {
            const program = gl.createProgram();
            if (program) {
              gl.attachShader(program, vertex);
              gl.attachShader(program, fragment);
              gl.linkProgram(program);
              webgl = gl.getProgramParameter(
                program,
                gl.LINK_STATUS,
              ) as boolean;
              gl.deleteProgram(program);
            }
          }
          if (vertex) gl.deleteShader(vertex);
          if (fragment) gl.deleteShader(fragment);

          let webgpu = false;
          if ("gpu" in navigator) {
            const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
            const adapter = await gpu?.requestAdapter();
            const device = await adapter?.requestDevice();
            if (device) {
              const module = device.createShaderModule({ code: wgslSource });
              const info = await module.getCompilationInfo();
              if (!info.messages.some((message) => message.type === "error")) {
                const vertex = device.createShaderModule({
                  code: `@vertex fn vertex_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(positions[index], 0.0, 1.0);
}`,
                });
                device.createRenderPipeline({
                  layout: "auto",
                  vertex: { module: vertex, entryPoint: "vertex_main" },
                  fragment: {
                    module,
                    entryPoint: "shdr_fragment_main",
                    targets: [{ format: "rgba8unorm" }],
                  },
                  primitive: { topology: "triangle-list" },
                });
                webgpu = true;
              }
            }
          }
          return { webgl, webgpu };
        },
        { glslSource: glsl.code, wgslSource: wgsl.code },
      );
      expect(result.webgl).toBe(true);
      expect(result.webgpu).toBe(true);
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("classifies finite literals, earlier aliases, and supported vector shapes", () => {
    const source = `import { vec2, vec3, vec4 } from "shdr";
const RADIUS = 0.1;
const NEGATIVE = -0.2;
const CENTER = vec2(0, RADIUS);
const TINT = vec3(CENTER, NEGATIVE);
const COPY = TINT;
const COLOR = vec4(CENTER, RADIUS, NEGATIVE);
const USED_COLOR = COLOR;
const USED_COPY = COPY;
`;
    const result = parseModuleConstants(source, [
      reference(source, "COLOR"),
      reference(source, "COPY"),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.constants.keys()].sort()).toEqual(
      ["COLOR", "COPY", "CENTER", "RADIUS", "NEGATIVE", "TINT"].sort(),
    );
    expect(result.constants.get("RADIUS")?.type).toEqual({
      kind: "scalar",
      scalar: "f32",
    });
    expect(result.constants.get("CENTER")?.type).toEqual({
      kind: "vector",
      scalar: "f32",
      size: 2,
    });
    expect(result.constants.get("TINT")?.type).toEqual({
      kind: "vector",
      scalar: "f32",
      size: 3,
    });
    expect(result.constants.get("COLOR")?.type).toEqual({
      kind: "vector",
      scalar: "f32",
      size: 4,
    });
    expect(result.constants.get("NEGATIVE")?.initializer).toMatchObject({
      kind: "literal",
      value: -0.2,
    });
  });

  it("masks reachable dependency declarations when a constant chain fails", () => {
    const source = `import { createFragmentShader, vec2, vec3, vec4 } from "shdr";
const A = vec3(0, 0, 0);
const BAD = vec2(A, 1);
export default createFragmentShader(() => vec4(BAD.x, 0, 0, 1));
`;
    const parsed = parseShaderFile(source, "module-constants.shdr.ts");
    expect(parsed.diagnostics[0]).toMatchObject({
      code: ShaderDiagnosticCode.InvalidConstructor,
    });
    expect(parsed.shaderRegions).toEqual(
      expect.arrayContaining([
        {
          start: source.indexOf("const A"),
          length: "const A = vec3(0, 0, 0);".length,
        },
        {
          start: source.indexOf("const BAD"),
          length: "const BAD = vec2(A, 1);".length,
        },
      ]),
    );

    const helperSource = `import { defineShaderFunction, vec2, vec3 } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";
const A = vec3(0, 0, 0);
const BAD = vec2(A, 1);
export const helper = defineShaderFunction((x: Expr<Vec2<F32>>) =>
  vec2(BAD.x + x.x, 0),
);
`;
    const helper = parseShaderFile(helperSource, "helper.shdr.ts");
    expect(helper.diagnostics[0]).toMatchObject({
      code: ShaderDiagnosticCode.InvalidConstructor,
    });
    expect(helper.shaderRegions).toEqual(
      expect.arrayContaining([
        {
          start: helperSource.indexOf("const A"),
          length: "const A = vec3(0, 0, 0);".length,
        },
        {
          start: helperSource.indexOf("const BAD"),
          length: "const BAD = vec2(A, 1);".length,
        },
      ]),
    );

    const multiHelperSource = `import { defineShaderFunction, vec3 } from "shdr";
import type { Expr, F32, Vec3 } from "shdr";
const A = vec3(0, 0, 0);
const BAD = 1 + 2;
const B = vec3(A);
export const first = defineShaderFunction((x: Expr<F32>) => x + BAD);
export const second = defineShaderFunction((x: Expr<Vec3<F32>>) => B.x + x.x);
`;
    const multiHelper = parseShaderFile(
      multiHelperSource,
      "multi-helper.shdr.ts",
    );
    expect(multiHelper.diagnostics[0]).toMatchObject({
      code: ShaderDiagnosticCode.UnsupportedOperator,
    });
    expect(multiHelper.shaderRegions).toEqual(
      expect.arrayContaining([
        {
          start: multiHelperSource.indexOf("const A"),
          length: "const A = vec3(0, 0, 0);".length,
        },
        {
          start: multiHelperSource.indexOf("const BAD"),
          length: "const BAD = 1 + 2;".length,
        },
        {
          start: multiHelperSource.indexOf("const B"),
          length: "const B = vec3(A);".length,
        },
      ]),
    );
  });

  it("resolves module names after fragment locals and helper parameters", () => {
    const source = `import { createFragmentShader, defineShaderFunction, vec4 } from "shdr";
import type { Expr, F32 } from "shdr";
const RADIUS = 0.1;
const RADIUS_ALIAS = RADIUS;
const identity = defineShaderFunction((RADIUS: Expr<F32>) => RADIUS);
export default createFragmentShader(() => {
  const RADIUS = 0.2;
  return vec4(identity(1), RADIUS, RADIUS_ALIAS, 1);
});
`;
    const result = compileFragment(source, { target: "glsl-es-300" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toContain("0.1");
      expect(result.code).toContain("0.2");
    }
  });

  it("rejects invalid module constants and nonliteral uniform defaults without an artifact", () => {
    const invalid = `import { createFragmentShader, vec4 } from "shdr";
const BAD = 1 + 2;
export default createFragmentShader(() => vec4(BAD, 0, 0, 1));
`;
    const invalidResult = compileFragment(invalid, {
      target: "glsl-es-300",
    });
    expect(invalidResult.ok).toBe(false);
    if (!invalidResult.ok) {
      expect(invalidResult.code).toBeUndefined();
      expect(invalidResult.diagnostics[0]).toMatchObject({
        code: ShaderDiagnosticCode.UnsupportedOperator,
        range: { start: invalid.indexOf("1 + 2") },
      });
    }

    const nonliteralDefault = `import { createFragmentShader, defineUniforms, vec4 } from "shdr";
const GAIN = 0.5;
const uniforms = defineUniforms((u) => ({ gain: u.f32(GAIN) }));
export default createFragmentShader(({ uniforms }) => vec4(uniforms.gain), { uniforms });
`;
    const defaultResult = compileFragment(nonliteralDefault, {
      target: "glsl-es-300",
    });
    expect(defaultResult.ok).toBe(false);
    if (!defaultResult.ok)
      expect(defaultResult.diagnostics[0]?.code).toBe(
        ShaderDiagnosticCode.InvalidCustomUniform,
      );
  });

  it("lowers helper-owned constants in an imported virtual graph", () => {
    const entry = `import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./helper.shdr.ts";
export default createFragmentShader(({ coord }) => vec4(scale(coord.x), 0, 0, 1));`;
    const helper = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
const FACTOR = 0.25;
export const scale = defineShaderFunction((x: Expr<F32>) => x * FACTOR);
`;
    const result = compileFragmentArtifact({
      entry: "/work/entry.shdr.ts",
      files: {
        "/work/entry.shdr.ts": entry,
        "/work/helper.shdr.ts": helper,
      },
    });
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.glsl).not.toContain("FACTOR");
    expect(result.artifact.wgsl).not.toContain("FACTOR");
    expect(result.artifact.glsl).toContain("0.25");
    expect(result.artifact.wgsl).toContain("0.25");
  });

  it("keeps helper constants private to their defining graph module", () => {
    const helper = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
const FACTOR = 0.25;
const SCALE = FACTOR;
export const scale = defineShaderFunction((SCALE: Expr<F32>) => SCALE * FACTOR);
`;
    const entry = `import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./helper.shdr.ts";
export default createFragmentShader(({ uniforms }) => {
  const SCALE = 0.5;
  return vec4(scale(uniforms.time), SCALE, 0, 1);
});
`;
    const first = compileFragmentArtifact({
      entry: "/work/first.shdr.ts",
      files: {
        "/work/first.shdr.ts": entry,
        "/work/helper.shdr.ts": helper,
      },
    });
    const second = compileFragmentArtifact({
      entry: "/work/second.shdr.ts",
      files: {
        "/work/second.shdr.ts": entry,
        "/work/helper.shdr.ts": helper,
      },
    });
    expect(first.ok, JSON.stringify(first.diagnostics)).toBe(true);
    expect(second.ok, JSON.stringify(second.diagnostics)).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.artifact).toEqual(second.artifact);
    expect(first.artifact.glsl).toContain("0.25");
    expect(first.artifact.glsl).not.toContain("FACTOR");

    const helperOnly = checkShaderGraph({
      entry: "/work/helper.shdr.ts",
      files: { "/work/helper.shdr.ts": helper },
    });
    expect(helperOnly.ok).toBe(true);
  });

  it("reports one defining-file error for invalid helper constants in check-only and graphs", () => {
    const helper = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
const BAD = 1 + 2;
export const scale = defineShaderFunction((x: Expr<F32>) => x * BAD);
`;
    const checkOnly = checkShaderGraph({
      entry: "/work/helper.shdr.ts",
      files: { "/work/helper.shdr.ts": helper },
    });
    expect(checkOnly.ok).toBe(false);
    if (!checkOnly.ok) {
      expect(checkOnly.diagnostics).toHaveLength(1);
      expect(checkOnly.diagnostics[0]).toMatchObject({
        code: ShaderDiagnosticCode.UnsupportedOperator,
        fileName: "/work/helper.shdr.ts",
        range: { start: helper.indexOf("1 + 2") },
      });
    }

    const entry = `import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./helper.shdr.ts";
export default createFragmentShader(({ uniforms }) => vec4(scale(uniforms.time), 0, 0, 1));
`;
    const graph = compileFragmentArtifact({
      entry: "/work/entry.shdr.ts",
      files: {
        "/work/entry.shdr.ts": entry,
        "/work/helper.shdr.ts": helper,
      },
    });
    expect(graph.ok).toBe(false);
    if (!graph.ok) {
      expect(graph.diagnostics).toHaveLength(1);
      expect(graph.diagnostics[0]).toMatchObject({
        code: ShaderDiagnosticCode.UnsupportedOperator,
        fileName: "/work/helper.shdr.ts",
      });
      expect(graph.artifact).toBeUndefined();
    }
  });

  it("rejects imported constants in helper definitions", () => {
    const entry = `import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./helper.shdr.ts";
export default createFragmentShader(({ uniforms }) => vec4(scale(uniforms.time), 0, 0, 1));
`;
    const helper = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
import { SCALE } from "./constants.shdr.ts";
export const scale = defineShaderFunction((x: Expr<F32>) => x * SCALE);
`;
    const result = compileFragmentArtifact({
      entry: "/work/entry.shdr.ts",
      files: {
        "/work/entry.shdr.ts": entry,
        "/work/helper.shdr.ts": helper,
        "/work/constants.shdr.ts": "export const SCALE = 0.25;",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.diagnostics[0]).toMatchObject({
        code: ShaderDiagnosticCode.ClosureCapture,
        fileName: "/work/helper.shdr.ts",
        range: { start: helper.lastIndexOf("SCALE") },
      });
  });

  it("analyzes only referenced declarations and leaves unused host code inert", () => {
    const source = `import { vec2 } from "shdr";
const UNUSED_CALL = computeColor();
const UNUSED_ARITHMETIC = 1 + 2;
const VALUE = 0.25;
const POINT = vec2(VALUE, 0);
const USED_POINT = POINT;
const USED_CALL = UNUSED_CALL;
`;
    const result = parseModuleConstants(source, [reference(source, "POINT")]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.constants.keys()]).toEqual(["POINT", "VALUE"]);

    const invalid = parseModuleConstants(source, [
      reference(source, "UNUSED_CALL"),
    ]);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.diagnostics[0]).toMatchObject({
      code: ShaderDiagnosticCode.UnsupportedCall,
    });
    expect(diagnosticText(source, invalid.diagnostics[0]!.range)).toBe(
      "computeColor()",
    );
  });

  it.each([
    {
      name: "forward reference",
      source: `const FIRST = SECOND;
const SECOND = 0.1;
const USED = FIRST;
`,
      requested: "FIRST",
      code: ShaderDiagnosticCode.ForwardReference,
      rangeText: "SECOND",
    },
    {
      name: "self reference",
      source: "const SELF = SELF;\nconst USED = SELF;\n",
      requested: "SELF",
      code: ShaderDiagnosticCode.ForwardReference,
      rangeText: "SELF",
    },
    {
      name: "initializer arithmetic",
      source: "const VALUE = 1 + 2;\nconst USED = VALUE;\n",
      requested: "VALUE",
      code: ShaderDiagnosticCode.UnsupportedOperator,
      rangeText: "1 + 2",
    },
    {
      name: "wrong vector shape",
      source: `import { vec2, vec3 } from "shdr";
const POINT = vec2(0, 0);
const BAD = vec3(POINT, POINT);
const USED = BAD;
`,
      requested: "BAD",
      code: ShaderDiagnosticCode.InvalidConstructor,
      rangeText: "vec3(POINT, POINT)",
    },
    {
      name: "f32 overflow",
      source: "const TOO_LARGE = 1e40;\nconst USED = TOO_LARGE;\n",
      requested: "TOO_LARGE",
      code: ShaderDiagnosticCode.InvalidNumericLiteral,
      rangeText: "1e40",
    },
    {
      name: "imported value",
      source: `import { external } from "./other.shdr.ts";
const VALUE = external;
const USED = VALUE;
`,
      requested: "VALUE",
      code: ShaderDiagnosticCode.ClosureCapture,
      rangeText: "external",
    },
    {
      name: "unsafe generated name",
      source: "const coord = 0.1;\nconst USED = coord;\n",
      requested: "coord",
      code: ShaderDiagnosticCode.DuplicateLocal,
      rangeText: "coord",
    },
    {
      name: "multiple declarators",
      source: "const FIRST = 0.1, SECOND = 0.2;\nconst USED = FIRST;\n",
      requested: "FIRST",
      code: ShaderDiagnosticCode.InvalidVariableDeclaration,
      rangeText: "FIRST = 0.1, SECOND = 0.2",
    },
    {
      name: "type annotation",
      source: "const VALUE: number = 0.1;\nconst USED = VALUE;\n",
      requested: "VALUE",
      code: ShaderDiagnosticCode.InvalidVariableDeclaration,
      rangeText: "VALUE: number = 0.1",
    },
  ])(
    "rejects $name at an authored range",
    ({ source, requested, code, rangeText }) => {
      const result = parseModuleConstants(source, [
        reference(source, requested),
      ]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostics[0]).toMatchObject({ code });
      expect(diagnosticText(source, result.diagnostics[0]!.range)).toContain(
        rangeText,
      );
    },
  );

  it("requires directly imported constructors and keeps helper/schema markers inert", () => {
    const withoutImportSource =
      "const POINT = vec2(0, 0);\nconst USED = POINT;\n";
    const withoutImport = parseModuleConstants(withoutImportSource, [
      reference(withoutImportSource, "POINT"),
    ]);
    expect(withoutImport.ok).toBe(false);
    if (!withoutImport.ok)
      expect(withoutImport.diagnostics[0]?.code).toBe(
        ShaderDiagnosticCode.UnsupportedCall,
      );

    const source = `import { defineShaderFunction, defineUniforms } from "shdr";
const helper = defineShaderFunction(() => 0);
const schema = defineUniforms((u) => ({ value: u.f32(0) }));
const USE_HELPER = helper;
const USE_SCHEMA = schema;
`;
    for (const name of ["helper", "schema"]) {
      const result = parseModuleConstants(source, [reference(source, name)]);
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.diagnostics[0]?.code).toBe(
          ShaderDiagnosticCode.ClosureCapture,
        );
    }
  });

  it("does not make a defining-file constant visible in another source", () => {
    const helper = "const PRIVATE = 0.5;\nconst USED = PRIVATE;\n";
    const local = parseModuleConstants(helper, [reference(helper, "PRIVATE")]);
    expect(local.ok).toBe(true);

    const entry = `import { PRIVATE } from "./helper.shdr.ts";
const VALUE = PRIVATE;
const USED = VALUE;
`;
    const imported = parseModuleConstants(entry, [reference(entry, "PRIVATE")]);
    expect(imported.ok).toBe(false);
    if (!imported.ok)
      expect(imported.diagnostics[0]).toMatchObject({
        code: ShaderDiagnosticCode.ClosureCapture,
        range: reference(entry, "PRIVATE").range,
      });
  });
});
