import {
  createVirtualSource,
  lowerShaderSyntax,
  parseShaderFile,
  ShaderDiagnosticCode,
  type ShaderConstDeclaration,
  type ShaderValueType,
} from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TypeScript7CheckerAdapter } from "../src/index.js";

const projectDirectory = fileURLToPath(
  new URL("fixtures/project/", import.meta.url),
);
const operandSources = {
  F32: "uniforms.time",
  Vec2: "uniforms.resolution",
  Vec4: "coord",
} as const;

type OperandName = keyof typeof operandSources;

interface DivisionCase {
  readonly left: OperandName;
  readonly right: OperandName;
  readonly result?: OperandName;
}

const divisionMatrix: readonly DivisionCase[] = [
  { left: "F32", right: "F32", result: "F32" },
  { left: "F32", right: "Vec2" },
  { left: "F32", right: "Vec4" },
  { left: "Vec2", right: "F32", result: "Vec2" },
  { left: "Vec2", right: "Vec2", result: "Vec2" },
  { left: "Vec2", right: "Vec4" },
  { left: "Vec4", right: "F32", result: "Vec4" },
  { left: "Vec4", right: "Vec2" },
  { left: "Vec4", right: "Vec4", result: "Vec4" },
];

describe("division rule parity", () => {
  it("keeps every TypeScript overload and semantic rule in agreement", () => {
    const adapter = new TypeScript7CheckerAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });

    try {
      for (const testCase of divisionMatrix) {
        const expression = `${operandSources[testCase.left]} / ${operandSources[testCase.right]}`;
        const fileName = join(
          projectDirectory,
          `division-${testCase.left.toLowerCase()}-${testCase.right.toLowerCase()}.shdr.ts`,
        );
        const source = `import { createFragmentShader } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const result = ${expression};
  return coord;
});
`;
        const parsed = parseShaderFile(source, fileName);
        expect(parsed.diagnostics, caseName(testCase)).toEqual([]);
        if (!parsed.info) continue;

        const semantic = lowerShaderSyntax(parsed.info.callback.syntax);
        const virtual = createVirtualSource(source, fileName);
        expect(virtual.ok, caseName(testCase)).toBe(true);
        if (!virtual.ok) continue;

        const checked = adapter.checkVirtualSource(
          fileName,
          virtual.virtualSource,
        );
        try {
          if (testCase.result) {
            expect(semantic.ok, caseName(testCase)).toBe(true);
            expect(
              checked.shaderOperationDiagnostics,
              caseName(testCase),
            ).toEqual([]);
            expect(checked.semanticDiagnostics, caseName(testCase)).toEqual([]);
            if (!semantic.ok) continue;

            const declaration = semantic.module.statements[0] as
              ShaderConstDeclaration | undefined;
            expect(declaration?.kind, caseName(testCase)).toBe(
              "const-declaration",
            );
            if (declaration?.kind !== "const-declaration") continue;
            expect(declaration.initializer).toMatchObject({
              kind: "binary",
              operator: "/",
              range: {
                start: source.indexOf(expression),
                length: expression.length,
              },
            });

            const semanticType = formatExpressionType(
              declaration.initializer.type,
            );
            expect(semanticType, caseName(testCase)).toBe(
              `Expr<${formatOperand(testCase.result)}>`,
            );
            expect(
              checked.getTypeOfNamedDeclaration("result")?.display,
              caseName(testCase),
            ).toBe(semanticType);
          } else {
            expect(semantic.ok, caseName(testCase)).toBe(false);
            if (semantic.ok) continue;

            expect(semantic.diagnostics, caseName(testCase)).toEqual([
              {
                code: ShaderDiagnosticCode.InvalidBinaryOperation,
                message: `Operator "/" cannot be applied to types "Expr<${formatOperand(testCase.left)}>" and "Expr<${formatOperand(testCase.right)}>".`,
                range: {
                  start: source.indexOf(expression),
                  length: expression.length,
                },
                severity: "error",
              },
            ]);
            expect(
              checked.semanticDiagnostics.map((diagnostic) => diagnostic.code),
              caseName(testCase),
            ).toEqual([2769]);
            expect(
              checked.shaderOperationDiagnostics,
              caseName(testCase),
            ).toEqual([
              expect.objectContaining({
                code: 2769,
                message: semantic.diagnostics[0]!.message,
                range: semantic.diagnostics[0]!.range,
              }),
            ]);
          }
        } finally {
          checked.dispose();
        }
      }
    } finally {
      adapter.dispose();
    }
  });
});

function formatExpressionType(type: ShaderValueType): string {
  return type.kind === "scalar" ? "Expr<F32>" : `Expr<Vec${type.size}<F32>>`;
}

function formatOperand(operand: OperandName): string {
  return operand === "F32" ? "F32" : `${operand}<F32>`;
}

function caseName(testCase: DivisionCase): string {
  return `${testCase.left} / ${testCase.right}`;
}
