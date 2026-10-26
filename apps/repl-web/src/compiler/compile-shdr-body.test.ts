import assert from "node:assert/strict";
import test from "node:test";
import { compileShdrBody } from "./compile-shdr-body.ts";
import { initialShaderSource } from "../shared/initial-source.ts";

function expectSuccess(body: string) {
  const result = compileShdrBody(body);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  return result.artifact;
}

function expectFailure(body: string) {
  const result = compileShdrBody(body);
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
