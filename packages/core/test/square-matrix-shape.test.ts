import { describe, expect, it } from "vitest";
import {
  lowerFragment,
  sameShaderValueType,
  ShaderDiagnosticCode,
  shaderTypeComponentCount,
  type ShaderMatrixType,
} from "../src/index.js";

function source(body: string, imports = "mat2, mat3, mat4, vec2, vec3, vec4") {
  return `import { createFragmentShader, ${imports} } from "shdr";
export default createFragmentShader(({ coord }) => {
  ${body}
});`;
}

function expectFailure(text: string, code: ShaderDiagnosticCode) {
  const result = lowerFragment(text);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.diagnostics[0]?.code).toBe(code);
  expect(result.diagnostics[0]?.range.length).toBeGreaterThan(0);
}

describe("square matrix core shape and safety", () => {
  it("keeps both matrix axes in equality and derives all components from both", () => {
    const square: ShaderMatrixType = {
      kind: "matrix",
      scalar: "f32",
      columns: 3,
      rows: 3,
    };
    const changedColumns: ShaderMatrixType = { ...square, columns: 2 };
    const changedRows: ShaderMatrixType = { ...square, rows: 2 };

    expect(sameShaderValueType(square, square)).toBe(true);
    expect(sameShaderValueType(square, changedColumns)).toBe(false);
    expect(sameShaderValueType(square, changedRows)).toBe(false);
    expect(shaderTypeComponentCount({ ...square, columns: 2, rows: 4 })).toBe(
      8,
    );
  });

  it("lowers all twelve square constructor families without admitting arithmetic", () => {
    const text = source(`
    const m2d = mat2(1);
    const m2f = mat2(1, 2, 3, 4);
    const m2c = mat2(vec2(1, 2), vec2(3, 4));
    const m2x = mat2(m2d);
    const m3d = mat3(1);
    const m3f = mat3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const m3c = mat3(vec3(1, 2, 3), vec3(4, 5, 6), vec3(7, 8, 9));
    const m3x = mat3(m3d);
    const m4d = mat4(1);
    const m4f = mat4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const m4c = mat4(vec4(1, 2, 3, 4), vec4(5, 6, 7, 8), vec4(9, 10, 11, 12), vec4(13, 14, 15, 16));
    const m4x = mat4(m4d);
    return vec4(1);
  `);
    const result = lowerFragment(text);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const types = result.ir.statements
      .filter((statement) => statement.kind === "const-declaration")
      .map((statement) => statement.initializer.type);
    expect(types).toHaveLength(12);
    expect(types.map((type) => type.kind === "matrix" && type.columns)).toEqual(
      [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4],
    );
    expect(
      types.every(
        (type) => type.kind === "matrix" && type.rows === type.columns,
      ),
    ).toBe(true);
  });

  it("rejects matrix unary, builtin, property, and mismatched constructor uses", () => {
    expectFailure(
      source("const m = mat2(1); return m + m;"),
      ShaderDiagnosticCode.InvalidBinaryOperation,
    );
    expectFailure(
      source("const m = mat2(1); return -m;"),
      ShaderDiagnosticCode.UnsupportedOperator,
    );
    expectFailure(
      source("const m = mat2(1); return m / 2;"),
      ShaderDiagnosticCode.InvalidBinaryOperation,
    );
    expectFailure(
      source("const m = mat2(1); return m * 2;"),
      ShaderDiagnosticCode.InvalidBinaryOperation,
    );
    expectFailure(
      source("const m = mat2(1); return m * vec2(1, 2);"),
      ShaderDiagnosticCode.InvalidBinaryOperation,
    );
    expectFailure(
      source("const m = mat2(1); return vec4(sin(m));", "mat2, vec4, sin"),
      ShaderDiagnosticCode.InvalidBuiltin,
    );
    expectFailure(
      source(
        "const m = mat2(1); return vec4(step(0, m).x, 0, 0, 1);",
        "mat2, vec4, step",
      ),
      ShaderDiagnosticCode.InvalidBuiltin,
    );
    expectFailure(
      source("const m = mat2(1); return vec4(m.xy, 0, 1);"),
      ShaderDiagnosticCode.InvalidSwizzle,
    );
    expectFailure(
      source("const m = mat2(1); return vec4(mat3(m).x, 0, 0, 1);"),
      ShaderDiagnosticCode.InvalidConstructor,
    );
  });

  it("rejects a matrix as the fragment result", () => {
    expectFailure(
      source("return mat2(1);"),
      ShaderDiagnosticCode.InvalidReturnType,
    );
  });
});
