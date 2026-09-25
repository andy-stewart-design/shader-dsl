import {
  createVirtualSource,
  lowerFragment,
  type ShaderValueType,
} from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { TypeScript7CheckerAdapter } from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));
const operands = {
  F32: "uniforms.time",
  Vec2: "uniforms.resolution",
  Vec3: "vec3(uniforms.time)",
  Vec4: "coord",
} as const;
type Value = keyof typeof operands;
const values = Object.keys(operands) as Value[];
const operators = ["+", "-", "*", "/"] as const;

function resultType(
  operator: string,
  left: Value,
  right: Value,
): Value | undefined {
  if (left === right) return left;
  if ((operator === "*" || operator === "/") && right === "F32") return left;
  return undefined;
}

function display(type: ShaderValueType): string {
  return type.kind === "scalar" ? "Expr<F32>" : `Expr<Vec${type.size}<F32>>`;
}

it("keeps the closed 4x4 matrix for all four binary operators in TS and IR", () => {
  const adapter = new TypeScript7CheckerAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    for (const operator of operators) {
      for (const left of values) {
        for (const right of values) {
          const expression = `${operands[left]} ${operator} ${operands[right]}`;
          const source = `import { createFragmentShader, vec3 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const result = ${expression};
  return coord;
});
`;
          const fileName = join(
            cwd,
            `arithmetic-${operator.charCodeAt(0)}-${left}-${right}.shdr.ts`,
          );
          const lowered = lowerFragment(source);
          const virtual = createVirtualSource(source, fileName);
          expect(virtual.ok, expression).toBe(true);
          if (!virtual.ok) continue;
          const checked = adapter.checkVirtualSource(
            fileName,
            virtual.virtualSource,
          );
          try {
            const expected = resultType(operator, left, right);
            if (expected) {
              expect(lowered.ok, expression).toBe(true);
              expect(checked.semanticDiagnostics, expression).toEqual([]);
              if (!lowered.ok) continue;
              const declaration = lowered.ir.statements[0];
              expect(declaration?.kind, expression).toBe("const-declaration");
              if (declaration?.kind !== "const-declaration") continue;
              expect(declaration.initializer, expression).toMatchObject({
                kind: "binary",
                operator,
                range: {
                  start: source.indexOf(expression),
                  length: expression.length,
                },
              });
              expect(display(declaration.initializer.type), expression).toBe(
                `Expr<${expected === "F32" ? "F32" : `${expected}<F32>`}>`,
              );
              expect(
                checked.getTypeOfNamedDeclaration("result")?.display,
                expression,
              ).toBe(display(declaration.initializer.type));
            } else {
              expect(lowered.ok, expression).toBe(false);
              if (lowered.ok) continue;
              expect(lowered.diagnostics[0], expression).toMatchObject({
                code: "SHDR1205",
                range: {
                  start: source.indexOf(expression),
                  length: expression.length,
                },
              });
              expect(checked.shaderOperationDiagnostics, expression).toEqual([
                expect.objectContaining({
                  message: lowered.diagnostics[0]!.message,
                  range: lowered.diagnostics[0]!.range,
                }),
              ]);
            }
          } finally {
            checked.dispose();
          }
        }
      }
    }
  } finally {
    adapter.dispose();
  }
});
