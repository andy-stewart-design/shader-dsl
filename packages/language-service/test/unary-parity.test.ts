import {
  createVirtualSource,
  lowerFragment,
  type ShaderConstDeclaration,
} from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { TypeScript7CheckerAdapter } from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));
const cases = [
  ["-uniforms.time", "Expr<F32>"],
  ["-uniforms.resolution", "Expr<Vec2<F32>>"],
  ["-vec3(uniforms.time)", "Expr<Vec3<F32>>"],
  ["-coord", "Expr<Vec4<F32>>"],
  ["-1 / 2", "Expr<F32>"],
  ["a - -b", "Expr<F32>"],
  ["-(a + b)", "Expr<F32>"],
] as const;

it("preserves unary types, precedence, literals and source-mapped operations", () => {
  const adapter = new TypeScript7CheckerAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    for (const [index, [expression, expected]] of cases.entries()) {
      const fileName = join(cwd, `unary-${index}.shdr.ts`);
      const source = `import { createFragmentShader, vec3 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const a = uniforms.time;
  const b = uniforms.time;
  const result = ${expression};
  return coord;
});
`;
      const lower = lowerFragment(source);
      const virtual = createVirtualSource(source, fileName);
      expect(lower.ok, expression).toBe(true);
      expect(virtual.ok, expression).toBe(true);
      if (!lower.ok || !virtual.ok) continue;
      const checked = adapter.checkVirtualSource(
        fileName,
        virtual.virtualSource,
      );
      try {
        expect(checked.semanticDiagnostics, expression).toEqual([]);
        expect(
          checked.getTypeOfNamedDeclaration("result")?.display,
          expression,
        ).toBe(expected);
        const declaration = lower.ir.statements[2] as ShaderConstDeclaration;
        const type = declaration.initializer.type;
        expect(
          type.kind === "scalar" ? "Expr<F32>" : `Expr<Vec${type.size}<F32>>`,
          expression,
        ).toBe(expected);
        expect(virtual.virtualSource.code, expression).toContain(
          "__shdr_internal_neg(",
        );
        const unary = virtual.virtualSource.operations.filter(
          (op) => op.kind === "unary-operation",
        );
        expect(unary.length, expression).toBeGreaterThan(0);
        for (const op of unary) {
          expect(
            source.slice(
              op.original.start,
              op.original.start + op.original.length,
            ),
          ).toMatch(/^-/);
        }
        if (expression === "-1 / 2") {
          expect(declaration.initializer).toMatchObject({
            kind: "binary",
            operator: "/",
            left: {
              kind: "unary",
              operator: "-",
              argument: { kind: "numeric-literal", value: 1 },
            },
          });
        }
        if (expression === "a - -b") {
          expect(declaration.initializer).toMatchObject({
            kind: "binary",
            operator: "-",
            right: { kind: "unary", operator: "-" },
          });
        }
        if (expression === "-(a + b)") {
          expect(declaration.initializer).toMatchObject({
            kind: "unary",
            operator: "-",
            argument: { kind: "binary", operator: "+" },
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

it("keeps a malformed unary operand source-ranged and hides virtual helpers", () => {
  const expression = "-uniforms";
  const fileName = join(cwd, "invalid-unary.shdr.ts");
  const source = `import { createFragmentShader } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const result = ${expression};
  return coord;
});`;
  const lower = lowerFragment(source);
  expect(lower.ok).toBe(false);
  if (lower.ok) return;
  expect(lower.diagnostics[0]).toMatchObject({
    code: "SHDR1203",
    range: { start: source.indexOf(expression) + 1, length: "uniforms".length },
  });
  const virtual = createVirtualSource(source, fileName);
  expect(virtual.ok).toBe(true);
  if (!virtual.ok) return;
  const adapter = new TypeScript7CheckerAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    const checked = adapter.checkVirtualSource(fileName, virtual.virtualSource);
    try {
      expect(checked.shaderOperationDiagnostics).toEqual([
        expect.objectContaining({
          range: {
            start: source.indexOf(expression),
            length: expression.length,
          },
          message: expect.stringContaining('Unary operator "-"'),
        }),
      ]);
      expect(checked.shaderOperationDiagnostics[0]?.message).not.toContain(
        "__shdr_internal_",
      );
    } finally {
      checked.dispose();
    }
  } finally {
    adapter.dispose();
  }
});

it("maps the smallest invalid nested operation to original source", () => {
  const expression = "coord.xy + (uniforms.time * coord.xy)";
  const fileName = join(cwd, "nested-invalid-arithmetic.shdr.ts");
  const source = `import { createFragmentShader } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const result = ${expression};
  return coord;
});`;
  const virtual = createVirtualSource(source, fileName);
  const lower = lowerFragment(source);
  expect(virtual.ok).toBe(true);
  expect(lower.ok).toBe(false);
  if (!virtual.ok || lower.ok) return;
  const adapter = new TypeScript7CheckerAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    const checked = adapter.checkVirtualSource(fileName, virtual.virtualSource);
    try {
      const invalid = "uniforms.time * coord.xy";
      expect(lower.diagnostics[0]).toMatchObject({
        code: "SHDR1205",
        range: { start: source.indexOf(invalid), length: invalid.length },
      });
      expect(checked.shaderOperationDiagnostics).toEqual([
        expect.objectContaining({
          range: lower.diagnostics[0]!.range,
          message: lower.diagnostics[0]!.message,
        }),
      ]);
    } finally {
      checked.dispose();
    }
  } finally {
    adapter.dispose();
  }
});
