import { describe, expect, it } from "vitest";
import { generateFragmentOutput } from "../src/generate-fragment.js";
import { lowerFragment, ShaderDiagnosticCode } from "../src/index.js";

function source(body: string, imports = "mat2, mat3, mat4, vec2, vec3, vec4") {
  return `import { createFragmentShader, ${imports} } from "shdr";
export default createFragmentShader(({ uniforms }) => {
  ${body}
});`;
}

function expectConstructorFailure(body: string) {
  const result = lowerFragment(source(body));
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.diagnostics[0]?.code).toBe(
    ShaderDiagnosticCode.InvalidConstructor,
  );
  expect(result.diagnostics[0]?.range.length).toBeGreaterThan(0);
}

describe("square matrix constructors", () => {
  it("preserves constructor kinds and target-neutral matrix types", () => {
    const result = lowerFragment(
      source(`
        const diagonal = mat2(uniforms.time);
        const coefficients = mat3(1, 2, 3, 4, 5, 6, 7, 8, 9);
        const columns = mat4(vec4(1, 2, 3, 4), vec4(5, 6, 7, 8), vec4(9, 10, 11, 12), vec4(13, 14, 15, 16));
        const copy = mat2(diagonal);
        return vec4(1);
      `),
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;

    const declarations = result.ir.statements.filter(
      (statement) => statement.kind === "const-declaration",
    );
    expect(
      declarations.map((statement) => statement.initializer),
    ).toMatchObject([
      {
        target: { kind: "constructor", name: "mat2" },
        arguments: [{ type: { kind: "scalar" } }],
      },
      {
        target: { kind: "constructor", name: "mat3" },
        arguments: { length: 9 },
      },
      {
        target: { kind: "constructor", name: "mat4" },
        arguments: { length: 4 },
      },
      {
        target: { kind: "constructor", name: "mat2" },
        arguments: [{ type: { kind: "matrix" } }],
      },
    ]);
    expect(declarations.map((statement) => statement.initializer.type)).toEqual(
      [
        { kind: "matrix", scalar: "f32", columns: 2, rows: 2 },
        { kind: "matrix", scalar: "f32", columns: 3, rows: 3 },
        { kind: "matrix", scalar: "f32", columns: 4, rows: 4 },
        { kind: "matrix", scalar: "f32", columns: 2, rows: 2 },
      ],
    );
  });

  it("emits single-evaluation diagonal helpers on both targets", () => {
    const result = lowerFragment(
      source("const matrix = mat3(uniforms.time); return vec4(1);"),
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const glsl = generateFragmentOutput(result.ir, "glsl-es-300").code;
    const wgsl = generateFragmentOutput(result.ir, "wgsl").code;

    expect(glsl).toContain("mat3 shdr_internal_mat3(float value)");
    expect(glsl).toContain("shdr_internal_mat3(u_time)");
    expect(wgsl).toContain("fn shdr_internal_mat3(value: f32) -> mat3x3<f32>");
    expect(wgsl).toContain("shdr_internal_mat3(shdr_time)");
    expect(glsl.match(/shdr_internal_mat3\(u_time\)/g)).toHaveLength(1);
    expect(wgsl.match(/shdr_internal_mat3\(shdr_time\)/g)).toHaveLength(1);
  });

  it("rejects excluded constructor shapes at the original call", () => {
    expectConstructorFailure("return vec4(mat2(1, 2, 3));");
    expectConstructorFailure("return vec4(mat2(vec2(1), 2, 3));");
    expectConstructorFailure(
      "const m = mat2(1); return vec4(mat3(m).x, 0, 0, 1);",
    );
    expectConstructorFailure("return vec4(mat2(vec2(1))); ");
    expectConstructorFailure("return vec4(mat2());");
  });
});
