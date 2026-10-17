import {
  createVirtualSource,
  lowerFragment,
  ShaderDiagnosticCode,
} from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TypeScript7EditorAdapter } from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));
const fileName = join(cwd, "square-matrix-editor.shdr.ts");
const imports = `import { createFragmentShader, defineShaderFunction, mat2, mat3, mat4, vec2, vec3, vec4, sin } from "shdr";
import type { Expr, F32, Mat2, Mat3, Mat4, Vec2, Vec3, Vec4 } from "shdr";`;

function shaderSource(
  body: string,
  extraImports = imports,
  declarations = "",
): string {
  return `${extraImports}
${declarations}
export default createFragmentShader(({ coord, uniforms }) => {
${body}
  return coord;
});
`;
}

function adapter(): TypeScript7EditorAdapter {
  return new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
}

function update(
  editor: TypeScript7EditorAdapter,
  source: string,
  version = 1,
  projectVersion = version,
  target = fileName,
) {
  return editor.updateDocument({
    fileName: target,
    source,
    version,
    projectVersion,
  });
}

function expectHover(
  document: ReturnType<TypeScript7EditorAdapter["updateDocument"]>,
  source: string,
  expected: string,
  from = 0,
): void {
  const start = source.indexOf("result", from);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(document.getQuickInfoAtPosition(start)).toMatchObject({
    display: expected,
    range: { start, length: "result".length },
  });
}

const constructorCases = [
  ["mat2(uniforms.time)", "Expr<Mat2<F32>>"],
  [
    "mat2(uniforms.time, uniforms.time, uniforms.time, uniforms.time)",
    "Expr<Mat2<F32>>",
  ],
  ["mat2(vec2(uniforms.time), vec2(uniforms.time))", "Expr<Mat2<F32>>"],
  ["mat2(mat2(uniforms.time))", "Expr<Mat2<F32>>"],
  ["mat3(uniforms.time)", "Expr<Mat3<F32>>"],
  [
    "mat3(uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time)",
    "Expr<Mat3<F32>>",
  ],
  [
    "mat3(vec3(uniforms.time), vec3(uniforms.time), vec3(uniforms.time))",
    "Expr<Mat3<F32>>",
  ],
  ["mat3(mat3(uniforms.time))", "Expr<Mat3<F32>>"],
  ["mat4(uniforms.time)", "Expr<Mat4<F32>>"],
  [
    "mat4(uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time)",
    "Expr<Mat4<F32>>",
  ],
  [
    "mat4(vec4(uniforms.time), vec4(uniforms.time), vec4(uniforms.time), vec4(uniforms.time))",
    "Expr<Mat4<F32>>",
  ],
  ["mat4(mat4(uniforms.time))", "Expr<Mat4<F32>>"],
] as const;

const binaryCases = [
  ["Mat2<F32>", "+", "Mat2<F32>", "Mat2<F32>"],
  ["Mat2<F32>", "-", "Mat2<F32>", "Mat2<F32>"],
  ["Mat2<F32>", "*", "F32", "Mat2<F32>"],
  ["F32", "*", "Mat2<F32>", "Mat2<F32>"],
  ["Mat2<F32>", "*", "Vec2<F32>", "Vec2<F32>"],
  ["Vec2<F32>", "*", "Mat2<F32>", "Vec2<F32>"],
  ["Mat2<F32>", "*", "Mat2<F32>", "Mat2<F32>"],
  ["Mat3<F32>", "+", "Mat3<F32>", "Mat3<F32>"],
  ["Mat3<F32>", "-", "Mat3<F32>", "Mat3<F32>"],
  ["Mat3<F32>", "*", "F32", "Mat3<F32>"],
  ["F32", "*", "Mat3<F32>", "Mat3<F32>"],
  ["Mat3<F32>", "*", "Vec3<F32>", "Vec3<F32>"],
  ["Vec3<F32>", "*", "Mat3<F32>", "Vec3<F32>"],
  ["Mat3<F32>", "*", "Mat3<F32>", "Mat3<F32>"],
  ["Mat4<F32>", "+", "Mat4<F32>", "Mat4<F32>"],
  ["Mat4<F32>", "-", "Mat4<F32>", "Mat4<F32>"],
  ["Mat4<F32>", "*", "F32", "Mat4<F32>"],
  ["F32", "*", "Mat4<F32>", "Mat4<F32>"],
  ["Mat4<F32>", "*", "Vec4<F32>", "Vec4<F32>"],
  ["Vec4<F32>", "*", "Mat4<F32>", "Vec4<F32>"],
  ["Mat4<F32>", "*", "Mat4<F32>", "Mat4<F32>"],
] as const;

describe("square matrix TypeScript 7 editor parity", () => {
  it("hovers all constructor families with concrete matrix results", () => {
    const editor = adapter();
    try {
      for (const [index, [call, expected]] of constructorCases.entries()) {
        const source = shaderSource(`  const result = ${call};`);
        const document = update(
          editor,
          source,
          1,
          1,
          join(cwd, `square-matrix-constructor-${index}.shdr.ts`),
        );
        expect(document.diagnostics, call).toEqual([]);
        expectHover(document, source, expected);
      }
    } finally {
      editor.dispose();
    }
  });

  it("hovers all matrix binary signatures with core-consistent results", () => {
    const editor = adapter();
    try {
      for (const [
        index,
        [leftType, operator, rightType, resultType],
      ] of binaryCases.entries()) {
        const left = leftType.startsWith("Mat")
          ? `mat${leftType[3]}(uniforms.time)`
          : leftType.startsWith("Vec")
            ? `vec${leftType[3]}(uniforms.time)`
            : "uniforms.time";
        const right = rightType.startsWith("Mat")
          ? `mat${rightType[3]}(uniforms.time)`
          : rightType.startsWith("Vec")
            ? `vec${rightType[3]}(uniforms.time)`
            : "uniforms.time";
        const expression = `${left} ${operator} ${right}`;
        const helper = `const compute = defineShaderFunction((left: Expr<${leftType}>, right: Expr<${rightType}>) => left ${operator} right);`;
        const source = shaderSource(
          `  const result = compute(${left}, ${right});`,
          imports,
          helper,
        );
        const document = update(
          editor,
          source,
          1,
          1,
          join(cwd, `square-matrix-binary-${index}.shdr.ts`),
        );
        const lowered = lowerFragment(source);
        expect(lowered.ok, expression).toBe(true);
        expect(document.diagnostics, expression).toEqual([]);
        expectHover(document, source, `Expr<${resultType}>`);
      }
    } finally {
      editor.dispose();
    }
  });

  it("routes matrix rejections to original ranges without virtual cascades", () => {
    const cases = [
      ["mat2(1, 2, 3)", ShaderDiagnosticCode.InvalidConstructor],
      ["mat2(1) + mat3(1)", ShaderDiagnosticCode.InvalidBinaryOperation],
      ["mat2(1) / 2", ShaderDiagnosticCode.InvalidBinaryOperation],
      ["-mat2(1)", ShaderDiagnosticCode.UnsupportedOperator],
      ["mat2(1).xy", ShaderDiagnosticCode.InvalidSwizzle],
      ["sin(mat2(1))", ShaderDiagnosticCode.InvalidBuiltin],
    ] as const;
    const editor = adapter();
    try {
      for (const [index, [expression, code]] of cases.entries()) {
        const source = shaderSource(`  const bad = ${expression};`);
        const lowered = lowerFragment(source);
        expect(lowered.ok, expression).toBe(false);
        if (lowered.ok) continue;
        const document = update(
          editor,
          source,
          1,
          1,
          join(cwd, `square-matrix-invalid-${index}.shdr.ts`),
        );
        expect(document.diagnostics, expression).toEqual([
          expect.objectContaining({
            source: "shdr",
            code,
            range: lowered.diagnostics[0]!.range,
          }),
        ]);
      }
    } finally {
      editor.dispose();
    }
  });

  it("rejects matrix indexing in the original source", () => {
    const source = shaderSource("  const bad = mat2(1)[0];");
    const virtual = createVirtualSource(source, fileName);
    expect(virtual.ok).toBe(false);
    if (virtual.ok) return;
    const editor = adapter();
    try {
      const document = update(editor, source);
      expect(document.diagnostics).toEqual([
        expect.objectContaining({
          source: "shdr",
          range: {
            start: source.indexOf("mat2(1)[0]"),
            length: "mat2(1)[0]".length,
          },
        }),
      ]);
    } finally {
      editor.dispose();
    }
  });

  it("refreshes unsaved imported matrix annotations and preserves file ownership", () => {
    const editor = adapter();
    const helperFile = join(cwd, "imported-helper.shdr.ts");
    const entryFile = join(cwd, "imported-entry.shdr.ts");
    const helper = `import { defineShaderFunction, mat3 } from "shdr";
import type { Expr, F32, Mat2, Mat3 } from "shdr";
export const transform = defineShaderFunction((x: Expr<Mat3<F32>>): Expr<Mat3<F32>> => mat3(x));`;
    const entry = `import { createFragmentShader, mat3, vec4 } from "shdr";
import { transform } from "./imported-helper.shdr.ts";
export default createFragmentShader(({ coord, uniforms }) => {
  const result = transform(mat3(uniforms.time));
  return coord;
});`;
    try {
      const initialHelper = update(editor, helper, 1, 1, helperFile);
      expect(initialHelper.diagnostics).toEqual([]);
      const initialEntry = update(editor, entry, 1, 1, entryFile);
      expect(initialEntry.diagnostics).toEqual([]);
      expectHover(initialEntry, entry, "Expr<Mat3<F32>>");

      const changed = helper.replace(
        "): Expr<Mat3<F32>> =>",
        "): Expr<Mat2<F32>> =>",
      );
      const invalidHelper = update(editor, changed, 2, 2, helperFile);
      expect(invalidHelper.diagnostics).toEqual([
        expect.objectContaining({
          source: "shdr",
          code: ShaderDiagnosticCode.InvalidReturnType,
          range: {
            start: changed.indexOf("mat3(x)"),
            length: "mat3(x)".length,
          },
        }),
      ]);
      const invalidEntry = update(editor, entry, 1, 2, entryFile);
      expect(invalidEntry.diagnostics).toEqual([]);

      const restored = update(editor, helper, 3, 3, helperFile);
      expect(restored.diagnostics).toEqual([]);
      const refreshed = update(editor, entry, 1, 3, entryFile);
      expect(refreshed.diagnostics).toEqual([]);
      expectHover(refreshed, entry, "Expr<Mat3<F32>>");

      const ordinary = editor.updateDocument({
        fileName: join(cwd, "ordinary.ts"),
        source: "const ordinary: string = 1;",
        version: 1,
        projectVersion: 3,
      });
      expect(ordinary).toMatchObject({
        isShader: false,
        delegated: true,
        diagnostics: [],
      });
    } finally {
      editor.dispose();
    }
  });
});
