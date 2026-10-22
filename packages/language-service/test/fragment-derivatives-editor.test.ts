import { lowerFragment, ShaderDiagnosticCode } from "@shdr/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TypeScript7EditorAdapter } from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));
const entryFile = join(cwd, "fragment-derivatives.shdr.ts");
const helperFile = join(cwd, "fragment-derivative-helper.shdr.ts");
const entry = readFileSync(entryFile, "utf8");
const helper = readFileSync(helperFile, "utf8");

function adapter() {
  return new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
}

function update(
  editor: TypeScript7EditorAdapter,
  fileName: string,
  source: string,
  version: number,
  projectVersion: number,
) {
  return editor.updateDocument({ fileName, source, version, projectVersion });
}

describe("fragment derivative TypeScript 7 editor parity", () => {
  it("hovers all twelve fragment signatures and imported helper calls", () => {
    const editor = adapter();
    try {
      const helperDocument = update(editor, helperFile, helper, 1, 1);
      const document = update(editor, entryFile, entry, 1, 1);
      expect(helperDocument.diagnostics).toEqual([]);
      expect(document.diagnostics).toEqual([]);
      for (const [name, display] of [
        ["scalarX", "Expr<F32>"],
        ["scalarY", "Expr<F32>"],
        ["scalarWidth", "Expr<F32>"],
        ["vector2X", "Expr<Vec2<F32>>"],
        ["vector2Y", "Expr<Vec2<F32>>"],
        ["vector2Width", "Expr<Vec2<F32>>"],
        ["vector3X", "Expr<Vec3<F32>>"],
        ["vector3Y", "Expr<Vec3<F32>>"],
        ["vector3Width", "Expr<Vec3<F32>>"],
        ["vector4X", "Expr<Vec4<F32>>"],
        ["vector4Y", "Expr<Vec4<F32>>"],
        ["vector4Width", "Expr<Vec4<F32>>"],
        ["imported", "Expr<F32>"],
      ] as const) {
        expect(
          document.getQuickInfoAtPosition(entry.indexOf(`${name} =`))?.display,
          name,
        ).toBe(display);
      }
      expect(
        helperDocument.getQuickInfoAtPosition(helper.indexOf("p:"))?.display,
      ).toBe("Expr<Vec2<F32>>");
    } finally {
      editor.dispose();
    }
  });

  it.each([
    [
      "wrong arity",
      entry.replace("dFdx(coord.x)", "dFdx(coord.x, coord.y)"),
      "dFdx(coord.x, coord.y)",
      ShaderDiagnosticCode.InvalidBuiltin,
    ],
    [
      "matrix operand",
      entry
        .replace("dFdx,", "dFdx, mat2,")
        .replace("dFdx(coord.x)", "dFdx(mat2(1))"),
      "dFdx(mat2(1))",
      ShaderDiagnosticCode.InvalidBuiltin,
    ],
    [
      "missing direct import",
      entry.replace("  dFdx,\n", "").replace("dFdx(coord.x)", "dFdx(coord.x)"),
      "dFdx(coord.x)",
      ShaderDiagnosticCode.UnsupportedCall,
    ],
    [
      "forbidden capture",
      `let outside = 1;\n${entry.replace("dFdx(coord.x)", "dFdx(outside)")}`,
      "outside",
      ShaderDiagnosticCode.ClosureCapture,
    ],
  ] as const)(
    "maps %s diagnostics to authored source",
    (_label, text, token, code) => {
      const editor = adapter();
      try {
        const document = update(editor, entryFile, text, 1, 1);
        const compiled = lowerFragment(text);
        expect(compiled.ok).toBe(false);
        if (compiled.ok) return;
        const expected = compiled.diagnostics.find(
          (item) => item.code === code,
        );
        expect(expected).toBeDefined();
        const actual = document.diagnostics.filter(
          (item) => item.source === "shdr",
        );
        expect(actual).toHaveLength(1);
        expect(actual[0]).toMatchObject({ code, range: expected?.range });
        expect(
          text.slice(
            actual[0]!.range.start,
            actual[0]!.range.start + actual[0]!.range.length,
          ),
        ).toContain(token);
        expect(JSON.stringify(actual)).not.toMatch(
          /__shdr_internal|virtual|generated/i,
        );
      } finally {
        editor.dispose();
      }
    },
  );

  it("maps texture operands to the derivative call without TypeScript cascades", () => {
    const text = `import { createFragmentShader, defineUniforms, dFdx, vec4 } from "shdr";
const uniforms = defineUniforms((u) => ({ photo: u.texture2D("/photo.png") }));
export default createFragmentShader(({ uniforms }) => vec4(dFdx(uniforms.photo), 0, 0, 1), { uniforms });`;
    const editor = adapter();
    try {
      const document = update(editor, entryFile, text, 1, 1);
      const compiled = lowerFragment(text);
      expect(compiled.ok).toBe(false);
      if (compiled.ok) return;
      const expected = compiled.diagnostics[0]!;
      expect(document.diagnostics).toEqual([
        expect.objectContaining({
          source: "shdr",
          code: ShaderDiagnosticCode.InvalidBuiltin,
          range: expected.range,
        }),
      ]);
      expect(
        text.slice(
          expected.range.start,
          expected.range.start + expected.range.length,
        ),
      ).toBe("dFdx(uniforms.photo)");
    } finally {
      editor.dispose();
    }
  });

  it("refreshes defining-file helper diagnostics and recovers after edits", () => {
    const editor = adapter();
    try {
      const validHelper = update(editor, helperFile, helper, 1, 1);
      const initial = update(editor, entryFile, entry, 1, 1);
      expect(validHelper.diagnostics).toEqual([]);
      expect(initial.diagnostics).toEqual([]);
      const invalidHelper = helper.replace("dFdx(p.x)", "dFdx(p.x, p.x)");
      const invalid = update(editor, helperFile, invalidHelper, 2, 2);
      const diagnostic = invalid.diagnostics.find(
        (item) => item.source === "shdr",
      );
      expect(invalid.diagnostics).toHaveLength(1);
      expect(diagnostic).toMatchObject({
        code: ShaderDiagnosticCode.InvalidBuiltin,
        range: {
          start: invalidHelper.indexOf("dFdx(p.x, p.x)"),
          length: "dFdx(p.x, p.x)".length,
        },
      });
      expect(JSON.stringify(invalid.diagnostics)).not.toMatch(
        /__shdr_internal|virtual|generated/i,
      );
      const refreshedCaller = update(editor, entryFile, entry, 1, 2);
      expect(refreshedCaller.diagnostics).toEqual([]);
      expect(
        refreshedCaller.getQuickInfoAtPosition(entry.indexOf("imported ="))
          ?.display,
      ).toBe("Expr<F32>");
      const restored = update(editor, helperFile, helper, 3, 3);
      const recovered = update(editor, entryFile, entry, 1, 3);
      expect(restored.diagnostics).toEqual([]);
      expect(recovered.diagnostics).toEqual([]);
      expect(
        recovered.getQuickInfoAtPosition(entry.indexOf("imported ="))?.display,
      ).toBe("Expr<F32>");
    } finally {
      editor.dispose();
    }
  });
});
