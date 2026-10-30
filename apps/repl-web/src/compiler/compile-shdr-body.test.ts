import assert from "node:assert/strict";
import test from "node:test";
import { compileShdrBody } from "./compile-shdr-body.ts";
import type { ShaderUniformDefinition } from "./uniform-definitions.ts";
import { initialShaderSource } from "../shared/initial-source.ts";

function expectSuccess(
  body: string,
  utils = "",
  uniforms: readonly ShaderUniformDefinition[] = [],
) {
  const result = compileShdrBody(body, utils, uniforms);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  return result.artifact;
}

function expectFailure(
  body: string,
  utils = "",
  uniforms: readonly ShaderUniformDefinition[] = [],
) {
  const result = compileShdrBody(body, utils, uniforms);
  if (result.ok) throw new Error("expected compilation to fail");
  return result.diagnostics;
}

test("compiles the default body to WGSL and GLSL", () => {
  const artifact = expectSuccess(initialShaderSource);
  assert.match(artifact.wgsl, /shdr_fragment_main/);
  assert.match(artifact.glsl, /void main/);
  assert.match(artifact.wgsl, /shdr_resolution/);
  assert.match(artifact.glsl, /u_resolution/);
});

test("keeps an empty Utils document backward compatible", () => {
  const withEmptyUtils = expectSuccess(initialShaderSource, "");
  const withoutUtils = expectSuccess(initialShaderSource);
  assert.equal(withEmptyUtils.wgsl, withoutUtils.wgsl);
  assert.equal(withEmptyUtils.glsl, withoutUtils.glsl);
});

test("compiles float and vec3 uniform definitions for both targets", () => {
  const definitions: readonly ShaderUniformDefinition[] = [
    { name: "gain", type: "f32", default: 0.5 },
    { name: "tint", type: "vec3", default: [1, 0, 0] },
  ];
  const artifact = expectSuccess(
    "return vec4(uniforms.tint * uniforms.gain, 1);",
    "",
    definitions,
  );
  assert.match(artifact.glsl, /shdr_custom_0/);
  assert.match(artifact.glsl, /shdr_custom_1/);
  assert.match(artifact.wgsl, /shdr_custom_0/);
  assert.match(artifact.wgsl, /shdr_custom_1/);
  assert.deepEqual(artifact.custom?.declarations, [
    { name: "gain", type: "f32", default: 0.5 },
    { name: "tint", type: "vec3", default: [1, 0, 0] },
  ]);
});

test("rejects unsafe generated uniform definitions", () => {
  const invalidDefinitions: readonly ShaderUniformDefinition[][] = [
    [{ name: "resolution", type: "f32", default: 0 }],
    [
      { name: "gain", type: "f32", default: 0 },
      { name: "gain", type: "f32", default: 1 },
    ],
    [{ name: "gain-name", type: "f32", default: 0 }],
    [{ name: "gain", type: "f32", default: Number.POSITIVE_INFINITY }],
    [{ name: "gain", type: "f32", default: 1e300 }],
  ];
  for (const definitions of invalidDefinitions) {
    const [diagnostic] = expectFailure("return vec4(0);", "", definitions);
    assert.equal(diagnostic?.code, "SHDR1210");
  }
});

test("compiles Utils helpers, constants, matrices, and forward declarations", () => {
  const utils = `const SCALE = 0.5;
const first = defineShaderFunction((p: Expr<Vec2<F32>>): Expr<Vec2<F32>> => second(p));
const second = defineShaderFunction((p: Expr<Vec2<F32>>): Expr<Vec2<F32>> => mat2(1) * p);
const tint = defineShaderFunction((uv: Expr<Vec2<F32>>): Expr<Vec3<F32>> => vec3(uv.x, uv.y, SCALE));
const matrix2 = defineShaderFunction((m: Expr<Mat2<F32>>): Expr<Mat2<F32>> => m + mat2(1));
const matrix3 = defineShaderFunction((m: Expr<Mat3<F32>>): Expr<Mat3<F32>> => m + mat3(1));
const matrix4 = defineShaderFunction((m: Expr<Mat4<F32>>): Expr<Mat4<F32>> => m + mat4(1));
// keep this Utils comment`;
  const artifact = expectSuccess(
    `const uv = first(coord.xy / uniforms.resolution);
const m2 = matrix2(mat2(1)) * uv;
const m3 = matrix3(mat3(1)) * vec3(uv, 0);
const m4 = matrix4(mat4(1)) * vec4(uv, 0, 1);
return vec4(m2.x, m3.y, m4.z, 1);`,
    utils,
  );
  assert.match(artifact.wgsl, /mat2x2/);
  assert.match(artifact.wgsl, /mat3x3/);
  assert.match(artifact.wgsl, /mat4x4/);
});

test("provides implicit coord and uniforms", () => {
  const artifact = expectSuccess(
    "const uv = coord.xy / uniforms.resolution;\nreturn vec4(uv, 0, 1);",
  );
  assert.match(artifact.wgsl, /shdr_coord/);
  assert.match(artifact.wgsl, /shdr_resolution/);
});

test("accepts supported callables without authored imports", () => {
  const artifact = expectSuccess(
    `const a = vec2(1, 2);
const b = vec3(a, 1);
const c = vec4(b, 1);
const m2 = mat2(1);
const m3 = mat3(1);
const m4 = mat4(1);
const transformed = m3 * b;
const value = dot(normalize(transformed), vec3(1));
return mix(c, vec4(value), 0.5);`,
  );
  assert.match(artifact.wgsl, /mat3x3/);
  assert.match(artifact.glsl, /shdr_internal_mat4/);
});

test("accepts all supported builtin imports, including unused sample", () => {
  expectSuccess("return vec4(0, 0, 0, 1);");
});

test("preserves a trailing line comment", () => {
  expectSuccess("return vec4(0, 0, 0, 1); // keep this comment");
});

test("maps first, middle, and end diagnostics into the body", () => {
  const bodies = [
    "return nope;",
    "const x = 1;\nreturn nope;",
    "const x = 1;\nconst y = nope;\nreturn vec4(x);",
  ];
  for (const body of bodies) {
    const diagnostics = expectFailure(body);
    assert.notEqual(diagnostics.length, 0);
    for (const diagnostic of diagnostics) {
      assert.ok(diagnostic.range.start >= 0);
      assert.ok(diagnostic.range.start <= body.length);
      assert.ok(diagnostic.range.length >= 0);
      assert.ok(
        diagnostic.range.start + diagnostic.range.length <= body.length,
      );
    }
  }
  assert.deepEqual(expectFailure(bodies[0])[0]?.range, { start: 7, length: 4 });
  assert.deepEqual(expectFailure(bodies[1])[0]?.range, {
    start: 20,
    length: 4,
  });
});

test("maps diagnostics to the correct document", () => {
  const utils = "const broken = ;";
  const main = "return nope;";
  const utilsDiagnostics = expectFailure("return vec4(0, 0, 0, 1);", utils);
  const mainDiagnostics = expectFailure(main, "const helper = 1;");

  assert.ok(utilsDiagnostics.length > 0);
  assert.ok(
    utilsDiagnostics.every((diagnostic) => diagnostic.document === "utils"),
  );
  assert.ok(
    utilsDiagnostics.every(
      ({ range }) =>
        range.start >= 0 && range.start + range.length <= utils.length,
    ),
  );
  assert.ok(mainDiagnostics.length > 0);
  assert.ok(
    mainDiagnostics.every((diagnostic) => diagnostic.document === "main"),
  );
  assert.ok(
    mainDiagnostics.every(
      ({ range }) =>
        range.start >= 0 && range.start + range.length <= main.length,
    ),
  );

  const emptyUtilsDiagnostics = expectFailure("return nope;");
  assert.ok(
    emptyUtilsDiagnostics.every((diagnostic) => diagnostic.document === "main"),
  );
});

test("maps generated-uniform collisions back to Utils", () => {
  const utils = "const uniforms = 1;";
  const diagnostics = expectFailure("return vec4(uniforms.gain);", utils, [
    { name: "gain", type: "f32", default: 0.5 },
  ]);
  assert.ok(diagnostics.length > 0);
  assert.ok(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.document === "utils" &&
        diagnostic.range.start <= utils.indexOf("uniforms") &&
        diagnostic.range.start + diagnostic.range.length <= utils.length,
    ),
  );
});

test("maps a Utils diagnostic to its local multiline range", () => {
  const utils = "const x=1;\nconst y=nope;";
  const diagnostics = expectFailure("return vec4(y);", utils);
  const nopeStart = utils.indexOf("nope");
  assert.ok(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.document === "utils" &&
        diagnostic.range.start === nopeStart &&
        diagnostic.range.length === "nope".length,
    ),
  );
});

test("maps generated suffix diagnostics to the body EOF", () => {
  const body = "return vec4(";
  const diagnostics = expectFailure(body);
  assert.ok(diagnostics.length > 0);
  for (const diagnostic of diagnostics) {
    assert.deepEqual(diagnostic.range, { start: body.length, length: 0 });
  }
});

test("reports malformed bodies only within visible ranges", () => {
  const body = "const value = 1;\nreturn vec4(";
  const diagnostics = expectFailure(body);
  assert.ok(diagnostics.length > 0);
  assert.ok(
    diagnostics.every(
      ({ range }) =>
        range.start >= 0 &&
        range.start + range.length <= body.length &&
        range.length >= 0,
    ),
  );
});

test("retains the core builtin shadowing restriction", () => {
  const [diagnostic] = expectFailure("const sin = 1;\nreturn vec4(sin);");
  assert.equal(diagnostic?.code, "SHDR1202");
  assert.match(
    diagnostic?.message ?? "",
    /shadows an imported shader callable/,
  );
});
