import { describe, expect, it } from "vitest";

import {
  parseShaderFile,
  ShaderDiagnosticCode,
  type ShaderDiagnosticCodeValue,
} from "../src/index.js";
import { readShaderFixture } from "./read-shader-fixture.js";

interface InvalidSyntaxCase {
  readonly fixture: string;
  readonly code: ShaderDiagnosticCodeValue;
  readonly messageCategory: string;
  readonly rangeText: string;
}

const invalidSyntaxCases: readonly InvalidSyntaxCase[] = [
  {
    fixture: "let",
    code: ShaderDiagnosticCode.InvalidVariableDeclaration,
    messageCategory: "const declarations",
    rangeText: "let value = uniforms.time;",
  },
  {
    fixture: "var",
    code: ShaderDiagnosticCode.InvalidVariableDeclaration,
    messageCategory: "const declarations",
    rangeText: "var value = uniforms.time;",
  },
  {
    fixture: "assignment",
    code: ShaderDiagnosticCode.UnsupportedAssignment,
    messageCategory: "Assignment",
    rangeText: "uv = coord.xy",
  },
  {
    fixture: "expression-statement",
    code: ShaderDiagnosticCode.UnsupportedStatement,
    messageCategory: "ExpressionStatement",
    rangeText: "vec4(coord.x, uniforms.time, 0, 1);",
  },
  {
    fixture: "unary-minus",
    code: ShaderDiagnosticCode.UnsupportedOperator,
    messageCategory: "Unary",
    rangeText: "-uniforms.time",
  },
  {
    fixture: "addition",
    code: ShaderDiagnosticCode.UnsupportedOperator,
    messageCategory: "binary operator",
    rangeText: "uniforms.time + 1",
  },
  {
    fixture: "if-statement",
    code: ShaderDiagnosticCode.UnsupportedStatement,
    messageCategory: "IfStatement",
    rangeText: "if (uniforms.time)",
  },
  {
    fixture: "nested-function",
    code: ShaderDiagnosticCode.NestedFunction,
    messageCategory: "Nested function",
    rangeText: "function shade()",
  },
  {
    fixture: "closure-capture",
    code: ShaderDiagnosticCode.ClosureCapture,
    messageCategory: "capture",
    rangeText: "scale",
  },
  {
    fixture: "type-annotation",
    code: ShaderDiagnosticCode.TypeAnnotation,
    messageCategory: "Type annotations",
    rangeText: ": number",
  },
  {
    fixture: "non-final-return",
    code: ShaderDiagnosticCode.InvalidReturn,
    messageCategory: "final shader statement",
    rangeText: "return vec4(coord.x, coord.y, 0, 1);",
  },
  {
    fixture: "optional-access",
    code: ShaderDiagnosticCode.UnsupportedPropertyAccess,
    messageCategory: "Optional access",
    rangeText: "uniforms?.time",
  },
  {
    fixture: "unsupported-call",
    code: ShaderDiagnosticCode.UnsupportedCall,
    messageCategory: "shader constructors",
    rangeText: "coord.x()",
  },
  {
    fixture: "computed-property",
    code: ShaderDiagnosticCode.UnsupportedPropertyAccess,
    messageCategory: "direct access",
    rangeText: 'coord["x"]',
  },
  {
    fixture: "missing-return",
    code: ShaderDiagnosticCode.InvalidReturn,
    messageCategory: "final return statement",
    rangeText: "{",
  },
  {
    fixture: "destructuring-declaration",
    code: ShaderDiagnosticCode.InvalidVariableDeclaration,
    messageCategory: "simple identifier",
    rangeText: "{ x }",
  },
  {
    fixture: "conditional-expression",
    code: ShaderDiagnosticCode.UnsupportedExpression,
    messageCategory: "ConditionalExpression",
    rangeText: "uniforms.time ? coord.x : coord.y",
  },
];

describe("shader syntax validation", () => {
  it("accepts the complete initial expression subset, including parentheses", () => {
    const source = `
      import { createFragmentShader, vec4 } from "shdr";

      export default createFragmentShader(({ coord, uniforms }) => {
        const uv = (coord.xy / uniforms.resolution);
        return vec4((uv.x), uv.y, 0, 1);
      });
    `;

    const result = parseShaderFile(source, "parentheses.shdr.ts");

    expect(result.diagnostics).toEqual([]);
    expect(result.info).toBeDefined();
  });

  it.each(invalidSyntaxCases)(
    "rejects $fixture with $code",
    async ({ fixture, code, messageCategory, rangeText }) => {
      const source = await readShaderFixture(`syntax/${fixture}`);
      const result = parseShaderFile(source, `${fixture}.shdr.ts`);

      expect(result.info).toBeUndefined();
      expect(result.diagnostics).toHaveLength(1);

      const diagnostic = result.diagnostics[0]!;
      const diagnosticText = source.slice(
        diagnostic.range.start,
        diagnostic.range.start + diagnostic.range.length,
      );

      expect(diagnostic.code).toBe(code);
      expect(diagnostic.message).toContain(messageCategory);
      expect(diagnosticText).toContain(rangeText);
      expect(diagnostic.range.start).toBeGreaterThanOrEqual(0);
      expect(
        diagnostic.range.start + diagnostic.range.length,
      ).toBeLessThanOrEqual(source.length);
    },
  );
});
