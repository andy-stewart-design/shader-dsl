import { createVirtualSource, lowerFragment } from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { TypeScript7CheckerAdapter } from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));

const constructorCases = [
  ["vec2(uniforms.time)", "Expr<Vec2<F32>>"],
  ["vec2(uniforms.time, 1)", "Expr<Vec2<F32>>"],
  ["vec2(uniforms.resolution)", "Expr<Vec2<F32>>"],
  ["vec3(uniforms.time)", "Expr<Vec3<F32>>"],
  ["vec3(uniforms.time, 0, 1)", "Expr<Vec3<F32>>"],
  ["vec3(coord.xyz)", "Expr<Vec3<F32>>"],
  ["vec2(coord.xyz)", undefined],
  ["vec3(uniforms.resolution, 1)", undefined],
  ["vec3(uniforms.time, 1)", undefined],
  ["vec2(coord.xy, 1)", undefined],
] as const;

function checkExpression(
  adapter: TypeScript7CheckerAdapter,
  expression: string,
  index: number,
) {
  const fileName = join(cwd, `vector-parity-${index}.shdr.ts`);
  const source = `import { createFragmentShader, vec2, vec3 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const result = ${expression};
  return coord;
});
`;
  const lowered = lowerFragment(source);
  const virtual = createVirtualSource(source, fileName);
  expect(virtual.ok, expression).toBe(true);
  if (!virtual.ok) throw new Error("Expected valid shader syntax");
  return {
    source,
    lowered,
    checked: adapter.checkVirtualSource(fileName, virtual.virtualSource),
  };
}

it("agrees on vec2/vec3 splat, component, copy and rejected packings", () => {
  const adapter = new TypeScript7CheckerAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    for (const [index, [expression, expected]] of constructorCases.entries()) {
      const { source, lowered, checked } = checkExpression(
        adapter,
        expression,
        index,
      );
      try {
        if (expected) {
          expect(lowered.ok, expression).toBe(true);
          expect(checked.semanticDiagnostics, expression).toEqual([]);
          expect(
            checked.getTypeOfNamedDeclaration("result")?.display,
            expression,
          ).toBe(expected);
          if (lowered.ok)
            expect(lowered.ir.statements[0], expression).toMatchObject({
              kind: "const-declaration",
              initializer: {
                kind: "call",
                type: {
                  kind: "vector",
                  size: expression.startsWith("vec2") ? 2 : 3,
                },
                range: {
                  start: source.indexOf(expression),
                  length: expression.length,
                },
              },
            });
        } else {
          expect(lowered.ok, expression).toBe(false);
          expect(
            checked.semanticDiagnostics.length,
            expression,
          ).toBeGreaterThan(0);
          if (!lowered.ok)
            expect(lowered.diagnostics[0], expression).toMatchObject({
              code: "SHDR1206",
              range: {
                start: source.indexOf(expression),
                length: expression.length,
              },
            });
        }
      } finally {
        checked.dispose();
      }
    }
  } finally {
    adapter.dispose();
  }
});

const swizzleCases = [
  ["uniforms.resolution.xxyy", "Expr<Vec4<F32>>"],
  ["uniforms.resolution.yx", "Expr<Vec2<F32>>"],
  ["uniforms.resolution.x", "Expr<F32>"],
  ["uniforms.resolution.yxx", "Expr<Vec3<F32>>"],
  ["coord.z", "Expr<F32>"],
  ["coord.xyzw", "Expr<Vec4<F32>>"],
  ["coord.xyz", "Expr<Vec3<F32>>"],
  ["coord.yx", "Expr<Vec2<F32>>"],
  ["coord.w", "Expr<F32>"],
  ["coord.xyz.zyxz", "Expr<Vec4<F32>>"],
  ["vec3(uniforms.time).zyx", "Expr<Vec3<F32>>"],
  ["vec3(uniforms.time).x", "Expr<F32>"],
  ["vec3(uniforms.time).xy", "Expr<Vec2<F32>>"],
  ["vec3(uniforms.time).zzyy", "Expr<Vec4<F32>>"],
  ["uniforms.resolution.z", undefined],
  ["coord.xyz.w", undefined],
  ["coord.rgba", undefined],
  ["coord.xyzwx", undefined],
  ["coord.x.x", undefined],
] as const;

it("agrees on read swizzles, including repetition, chaining and invalid names", () => {
  const adapter = new TypeScript7CheckerAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    for (const [index, [expression, expected]] of swizzleCases.entries()) {
      const { source, lowered, checked } = checkExpression(
        adapter,
        expression,
        index + 100,
      );
      try {
        if (expected) {
          expect(lowered.ok, expression).toBe(true);
          expect(checked.semanticDiagnostics, expression).toEqual([]);
          expect(
            checked.getTypeOfNamedDeclaration("result")?.display,
            expression,
          ).toBe(expected);
          if (lowered.ok) {
            const declaration = lowered.ir.statements[0];
            expect(declaration?.kind, expression).toBe("const-declaration");
            if (declaration?.kind === "const-declaration") {
              const type = declaration.initializer.type;
              expect(
                type.kind === "scalar"
                  ? "Expr<F32>"
                  : `Expr<Vec${type.size}<F32>>`,
                expression,
              ).toBe(expected);
            }
          }
        } else {
          expect(lowered.ok, expression).toBe(false);
          expect(
            checked.semanticDiagnostics.length,
            expression,
          ).toBeGreaterThan(0);
          if (!lowered.ok)
            expect(lowered.diagnostics[0], expression).toMatchObject({
              code: "SHDR1204",
              range: {
                start: source.lastIndexOf(".") + 1,
                length: expression.length - expression.lastIndexOf(".") - 1,
              },
            });
        }
      } finally {
        checked.dispose();
      }
    }
  } finally {
    adapter.dispose();
  }
});
