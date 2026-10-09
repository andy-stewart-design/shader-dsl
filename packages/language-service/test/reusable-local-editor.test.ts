import { lowerFragment, ShaderDiagnosticCode } from "@shdr/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TypeScript7EditorAdapter,
  type TypeScript7EditorDocument,
} from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));
const fileName = join(cwd, "reusable-local.shdr.ts");
const representative = readFileSync(fileName, "utf8");
const imports = `import { createFragmentShader, defineShaderFunction, vec2, vec3, vec4, sqrt, fract, clamp } from "shdr";
import type { Expr, F32, Vec2, Vec3, Vec4 } from "shdr";`;
function source(
  helpers: string,
  expression = "vec4(f(uniforms.time))",
  extra = "",
): string {
  return `${imports}\n${extra}\n${helpers}\nexport default createFragmentShader(({ coord, uniforms }) => ${expression});`;
}
function adapter() {
  return new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
}
function update(
  editor: TypeScript7EditorAdapter,
  text: string,
  version = 1,
  projectVersion = 1,
) {
  return editor.updateDocument({
    fileName,
    source: text,
    version,
    projectVersion,
  });
}
function hover(
  document: TypeScript7EditorDocument,
  text: string,
  token: string,
  display: string,
  from = 0,
) {
  const start = text.indexOf(token, from);
  expect(start, token).toBeGreaterThanOrEqual(0);
  const info = document.getQuickInfoAtPosition(start);
  expect(info, token).toMatchObject({
    display,
    range: { start, length: token.match(/^\w+/)![0].length },
  });
  return info!;
}

describe("same-file shader helper TypeScript 7 editor parity", () => {
  it("transforms helper-only bodies while retaining ordinary TypeScript diagnostics", () => {
    const editor = adapter();
    const text = `import { defineShaderFunction } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";
const ordinary: string = 1;
export const scale = defineShaderFunction((x: Expr<F32>) => x * 0.5);`;
    try {
      const document = update(editor, text);
      expect(document.diagnostics).toEqual([
        expect.objectContaining({ source: "typescript", code: 2322 }),
      ]);
      expect(
        document.getQuickInfoAtPosition(text.indexOf("scale ="))?.display,
      ).toContain("Expr<F32>");
      const widened = text.replace("Expr<F32>", "Expr<Vec2<F32>>");
      const refreshed = update(editor, widened, 2, 2);
      expect(refreshed.diagnostics).toEqual([
        expect.objectContaining({ source: "typescript", code: 2322 }),
      ]);
      expect(
        refreshed.getQuickInfoAtPosition(widened.indexOf("scale ="))?.display,
      ).toContain("Expr<Vec2<F32>>");
    } finally {
      editor.dispose();
    }
  });

  it("refreshes imported helper hovers and reports a newly invalid call", () => {
    const editor = adapter();
    const helperFile = join(cwd, "imported-helper.shdr.ts");
    const entryFile = join(cwd, "imported-entry.shdr.ts");
    const helper = readFileSync(helperFile, "utf8");
    const entry = readFileSync(entryFile, "utf8");
    try {
      editor.updateDocument({
        fileName: helperFile,
        source: helper,
        version: 1,
        projectVersion: 1,
      });
      const initial = editor.updateDocument({
        fileName: entryFile,
        source: entry,
        version: 1,
        projectVersion: 1,
      });
      expect(initial.diagnostics).toEqual([]);
      expect(
        initial.getQuickInfoAtPosition(entry.indexOf("scale("))?.display,
      ).toContain("Expr<F32>");

      const widened = helper.replace("Expr<F32>", "Expr<Vec2<F32>>");
      editor.updateDocument({
        fileName: helperFile,
        source: widened,
        version: 2,
        projectVersion: 2,
      });
      const refreshed = editor.updateDocument({
        fileName: entryFile,
        source: entry,
        version: 1,
        projectVersion: 2,
      });
      expect(refreshed.diagnostics).toEqual([
        expect.objectContaining({ source: "shdr", code: "SHDR1213" }),
      ]);
      expect(
        refreshed.getQuickInfoAtPosition(entry.indexOf("scale("))?.display,
      ).toContain("Expr<Vec2<F32>>");
    } finally {
      editor.dispose();
    }
  });

  it("infers forward/transitive calls and hovers definitions, parameters, locals and fragment uses", () => {
    const editor = adapter();
    try {
      const document = update(editor, representative);
      expect(lowerFragment(representative).ok).toBe(true);
      expect(document.diagnostics).toEqual([]);
      hover(document, representative, "p:", "Expr<Vec2<F32>>");
      hover(document, representative, "seed:", "Expr<F32>");
      hover(document, representative, "level =", "Expr<F32>");
      hover(document, representative, "rgb =", "Expr<Vec3<F32>>");
      hover(document, representative, "uv, root", "Expr<Vec2<F32>>");
      hover(document, representative, "rgb, 1", "Expr<Vec3<F32>>");
      const definition = representative.indexOf("grain =");
      const use = representative.indexOf("grain(p");
      const grain = document.getQuickInfoAtPosition(definition)!;
      expect(grain.name).toBe("grain");
      expect(grain.display).toContain("ShaderFunction<");
      expect(grain.display).toContain("Expr<Vec2<F32>>");
      expect(grain.display).toContain("Expr<F32>");
      expect(grain.display).not.toMatch(/any|number|__shdr_internal/);
      expect(grain.range).toEqual({ start: definition, length: 5 });
      expect(document.getQuickInfoAtPosition(use)).toEqual({
        ...grain,
        range: { start: use, length: 5 },
      });
      const palette = document.getQuickInfoAtPosition(
        representative.indexOf("palette ="),
      )!;
      expect(palette.display).toContain("Expr<Vec3<F32>>");
      expect(
        document.getQuickInfoAtPosition(representative.indexOf("palette(uv"))
          ?.display,
      ).toBe(palette.display);
      for (const token of [
        "* 0.1031",
        "+ p.y",
        "+ 0.125",
        "/ uniforms",
        "0.11369",
        "1);",
      ]) {
        expect(
          document.getQuickInfoAtPosition(representative.indexOf(token)),
          token,
        ).toBeUndefined();
      }
    } finally {
      editor.dispose();
    }
  });

  it.each(["F32", "Vec2<F32>", "Vec3<F32>", "Vec4<F32>"])(
    "checks inferred/annotated %s helper returns and their uses",
    (type) => {
      const editor = adapter();
      try {
        const value =
          type === "F32"
            ? "uniforms.time"
            : type.startsWith("Vec2")
              ? "coord.xy"
              : type.startsWith("Vec3")
                ? "coord.xyz"
                : "coord";
        const result =
          type === "F32" || type.startsWith("Vec4")
            ? "vec4(value)"
            : "vec4(value.x, 0, 0, 1)";
        for (const [index, annotation] of ["", `: Expr<${type}>`].entries()) {
          const text = source(
            `const f = defineShaderFunction((x: Expr<${type}>)${annotation} => x + 0.125);`,
            `{ const value = f(${value}); return ${result}; }`,
          );
          const document = update(editor, text, index + 1);
          expect(lowerFragment(text).ok).toBe(true);
          expect(document.diagnostics).toEqual([]);
          hover(document, text, "x:", `Expr<${type}>`);
          hover(document, text, "value =", `Expr<${type}>`);
          hover(
            document,
            text,
            "value",
            `Expr<${type}>`,
            text.indexOf("return"),
          );
        }
      } finally {
        editor.dispose();
      }
    },
  );

  it("supports zero-argument helpers, explicit uniform arguments and dynamic domain preconditions", () => {
    const editor = adapter();
    try {
      const text = source(
        `const one = defineShaderFunction(() => 1);
const root = defineShaderFunction((x: Expr<F32>) => sqrt(x));
const f = defineShaderFunction((x: Expr<F32>) => root(x) + one());`,
        "vec4(root(-1), f(uniforms.time), one(), 1)",
      );
      expect(lowerFragment(text).ok).toBe(true);
      const document = update(editor, text);
      expect(document.diagnostics).toEqual([]);
      const one = document.getQuickInfoAtPosition(text.indexOf("one ="))!;
      expect(one.display).toContain("ShaderFunction<[], Expr<F32>>");
      expect(
        document.getQuickInfoAtPosition(text.indexOf("root(-1"))?.display,
      ).toContain("Expr<F32>");
      const custom = source(
        "const f = defineShaderFunction((x: Expr<F32>) => x + 1);",
        "vec4(f(uniforms.gain))",
        "const uniforms = defineUniforms((u) => ({ gain: u.f32(0.1) }));",
      )
        .replace(
          "defineShaderFunction,",
          "defineShaderFunction, defineUniforms,",
        )
        .replace(
          "=> vec4(f(uniforms.gain)));",
          "=> vec4(f(uniforms.gain)), { uniforms });",
        );
      expect(lowerFragment(custom).ok).toBe(true);
      const customDocument = update(editor, custom, 2);
      expect(customDocument.diagnostics).toEqual([]);
      expect(
        customDocument.getQuickInfoAtPosition(custom.indexOf("gain))")),
      ).toMatchObject({ display: "Expr<F32>" });
    } finally {
      editor.dispose();
    }
  });

  const failures = [
    {
      helpers: "const f = defineShaderFunction((x) => x + 1);",
      code: ShaderDiagnosticCode.InvalidShaderFunction,
      token: "x",
      from: "((x)",
    },
    {
      helpers: "const f = defineShaderFunction((x: number) => x);",
      code: ShaderDiagnosticCode.InvalidShaderFunction,
      token: "x: number",
    },
    {
      helpers: "const f = defineShaderFunction((x: Expr<F32>) => coord.x);",
      code: ShaderDiagnosticCode.ClosureCapture,
      token: "coord",
    },
    {
      helpers:
        "const f = defineShaderFunction((x: Expr<F32>) => x + captured);",
      extra: "const captured = 1;",
      code: ShaderDiagnosticCode.ClosureCapture,
      token: "captured",
      from: "x +",
    },
    {
      helpers:
        "const f = defineShaderFunction((x: Expr<F32>): Expr<F32> => vec2(x));",
      code: ShaderDiagnosticCode.InvalidReturnType,
      token: "vec2(x)",
    },
    {
      helpers: "const f = defineShaderFunction((x: Expr<F32>) => x);",
      expression: "vec4(f())",
      code: ShaderDiagnosticCode.InvalidShaderFunctionCall,
      token: "f()",
    },
    {
      helpers: "const f = defineShaderFunction((x: Expr<F32>) => x);",
      expression: "vec4(f(coord.xy))",
      code: ShaderDiagnosticCode.InvalidShaderFunctionCall,
      token: "f(coord.xy)",
    },
    {
      helpers: "const f = defineShaderFunction((x: Expr<F32>) => x);",
      expression: "vec4(f(uniforms.time, 1))",
      code: ShaderDiagnosticCode.InvalidShaderFunctionCall,
      token: "f(uniforms.time, 1)",
    },
    {
      helpers: "const f = defineShaderFunction((x: Expr<F32>) => sqrt(-1));",
      code: ShaderDiagnosticCode.InvalidBuiltinDomain,
      token: "sqrt(-1)",
    },
    {
      helpers:
        "const f = defineShaderFunction((x: Expr<F32>) => sqrt(vec2(x, -1)).x);",
      code: ShaderDiagnosticCode.InvalidBuiltinDomain,
      token: "sqrt(vec2(x, -1))",
    },
    {
      helpers: "const f = defineShaderFunction((x: Expr<F32>) => sqrt(x, x));",
      code: ShaderDiagnosticCode.InvalidBuiltin,
      token: "sqrt(x, x)",
    },
    {
      helpers: "const f = defineShaderFunction((x: Expr<F32>) => ordinary(x));",
      extra: "const ordinary = (x: unknown) => x;",
      code: ShaderDiagnosticCode.UnsupportedCall,
      token: "ordinary(x)",
    },
    {
      helpers:
        "const f = defineShaderFunction((x: Expr<Vec2<F32>>) => x + vec3(0));",
      expression: "vec4(f(coord.xy).x, 0, 0, 1)",
      code: ShaderDiagnosticCode.InvalidBinaryOperation,
      token: "x + vec3(0)",
    },
    {
      helpers: "const f = defineShaderFunction((x: Expr<F32>) => x + 1e999);",
      code: ShaderDiagnosticCode.InvalidNumericLiteral,
      token: "1e999",
    },
    {
      helpers: "const f = defineShaderFunction((x: Expr<F32>) => f(x));",
      code: ShaderDiagnosticCode.RecursiveShaderFunction,
      token: "f(x)",
    },
    {
      helpers:
        "const f = defineShaderFunction((x: Expr<F32>) => g(x));\nconst g = defineShaderFunction((x: Expr<F32>) => f(x));",
      code: ShaderDiagnosticCode.RecursiveShaderFunction,
      token: "f(x)",
    },
    {
      helpers:
        "const f = defineShaderFunction((x: Expr<F32>) => { let y = x; return y; });",
      code: ShaderDiagnosticCode.InvalidVariableDeclaration,
      token: "let y = x;",
    },
    {
      helpers: "const f = defineShaderFunction((x: Expr<F32>) => x);",
      expression: "{ const f = uniforms.time; return vec4(f); }",
      code: ShaderDiagnosticCode.DuplicateLocal,
      token: "f",
      from: "const f = uniforms",
    },
  ];
  it.each(failures)(
    "routes $code at $token exactly once, agreeing with core",
    ({ helpers, expression, extra, code, token, from }) => {
      const editor = adapter();
      try {
        const text = source(helpers, expression, extra);
        const lowered = lowerFragment(text);
        expect(lowered.ok).toBe(false);
        if (lowered.ok) return;
        expect(lowered.diagnostics).toHaveLength(1);
        const document = update(editor, text);
        expect(
          document.diagnostics.map(({ code, message, range, source }) => ({
            code,
            message,
            range,
            source,
          })),
        ).toEqual(
          lowered.diagnostics.map(({ code, message, range }) => ({
            code,
            message,
            range,
            source: "shdr",
          })),
        );
        expect(document.diagnostics[0]!.code).toBe(code);
        const range = document.diagnostics[0]!.range;
        expect(text.slice(range.start, range.start + range.length)).toBe(token);
        expect(range.start).toBe(
          text.indexOf(token, from ? text.indexOf(from) : 0),
        );
        expect(document.getQuickInfoAtPosition(range.start)).toBeUndefined();
        expect(document.diagnostics[0]!.message).not.toContain(
          "__shdr_internal_",
        );
      } finally {
        editor.dispose();
      }
    },
  );

  it.each(["valid", "domain", "annotation"])(
    "preserves ordinary TypeScript between disjoint shader regions (helper: %s)",
    (invalid) => {
      const editor = adapter();
      try {
        const text =
          source(
            `const f = defineShaderFunction((x${invalid === "annotation" ? "" : ": Expr<F32>"}) => ${invalid === "domain" ? "sqrt(-1)" : "x + 1"});
const between: string = 2;
const g = defineShaderFunction((x: Expr<F32>) => x / 2);`,
            "vec4(f(g(uniforms.time)))",
            "const before: string = 1;",
          ) + "\nconst after: string = 3;\nconst host = 1 + 2;";
        const document = update(editor, text);
        const native = document.diagnostics.filter(
          (diagnostic) => diagnostic.source === "typescript",
        );
        expect(native).toEqual(
          ["before", "between", "after"].map((name) =>
            expect.objectContaining({
              code: 2322,
              range: { start: text.indexOf(`${name}:`), length: name.length },
            }),
          ),
        );
        expect(
          document.diagnostics.filter(
            (diagnostic) => diagnostic.source === "shdr",
          ),
        ).toHaveLength(invalid === "valid" ? 0 : 1);
        hover(document, text, "host =", "number");
      } finally {
        editor.dispose();
      }
    },
  );

  it("updates helper inference and clears faults across unsaved edits, project versions and reopening", () => {
    const editor = adapter();
    const firstText = source(
      "const f = defineShaderFunction((x: Expr<F32>) => x + 1);",
      "{ const value = f(uniforms.time); return vec4(value); }",
    );
    try {
      const first = update(editor, firstText);
      expect(update(editor, firstText)).toBe(first);
      hover(first, firstText, "value =", "Expr<F32>");
      const vectorText = firstText.replace("=> x + 1", "=> vec4(x)");
      const vector = update(editor, vectorText, 2);
      expect(vector.diagnostics).toEqual([]);
      hover(vector, vectorText, "value =", "Expr<Vec4<F32>>");
      expect(
        first.getQuickInfoAtPosition(firstText.indexOf("value =")),
      ).toBeUndefined();
      const badText = vectorText.replace("f(uniforms.time)", "f(coord)");
      const bad = update(editor, badText, 3);
      expect(bad.diagnostics).toEqual([
        expect.objectContaining({
          code: ShaderDiagnosticCode.InvalidShaderFunctionCall,
        }),
      ]);
      const fixed = update(editor, vectorText, 4, 2);
      expect(fixed.diagnostics).toEqual([]);
      hover(fixed, vectorText, "value =", "Expr<Vec4<F32>>");
      expect(
        bad.getQuickInfoAtPosition(badText.indexOf("f =")),
      ).toBeUndefined();
      editor.closeDocument(fileName);
      expect(
        fixed.getQuickInfoAtPosition(vectorText.indexOf("value =")),
      ).toBeUndefined();
      const reopened = update(editor, firstText, 5, 2);
      expect(reopened.diagnostics).toEqual([]);
      hover(reopened, firstText, "value =", "Expr<F32>");
      editor.dispose();
      expect(
        reopened.getQuickInfoAtPosition(firstText.indexOf("f =")),
      ).toBeUndefined();
    } finally {
      editor.dispose();
    }
  });

  it("preserves trusted helper signature hovers when a fragment invocation is invalid", () => {
    const editor = adapter();
    try {
      const text = source(
        "const f = defineShaderFunction((x: Expr<F32>) => x + 1);",
        "vec4(f(coord))",
      );
      const document = update(editor, text);
      expect(document.diagnostics).toEqual([
        expect.objectContaining({
          code: ShaderDiagnosticCode.InvalidShaderFunctionCall,
        }),
      ]);
      const definition = document.getQuickInfoAtPosition(text.indexOf("f ="))!;
      expect(definition.display).toContain(
        "ShaderFunction<[x: Expr<F32>], Expr<F32>>",
      );
      hover(document, text, "x +", "Expr<F32>");
      expect(
        document.getQuickInfoAtPosition(text.indexOf("f(coord)")),
      ).toBeUndefined();
    } finally {
      editor.dispose();
    }
  });

  it("switches between rewritten and identity-only helpers without stale inferred types", () => {
    const editor = adapter();
    try {
      const texts = [
        source(
          "const f = defineShaderFunction((x: Expr<Vec4<F32>>) => x + 1);",
          "f(coord)",
        ),
        source(
          "const f = defineShaderFunction((x: Expr<Vec4<F32>>) => x);",
          "f(coord)",
        ),
        source(
          "const f = defineShaderFunction((x: Expr<F32>) => x);",
          "vec4(f(uniforms.time))",
        ),
      ];
      for (const [index, text] of texts.entries()) {
        const document = update(editor, text, index + 1);
        expect(document.diagnostics).toEqual([]);
        const display = document.getQuickInfoAtPosition(
          text.indexOf("f ="),
        )!.display;
        expect(display).toContain(
          index === 2 ? "Expr<F32>" : "Expr<Vec4<F32>>",
        );
        expect(display).not.toContain("any");
      }
    } finally {
      editor.dispose();
    }
  });

  it("keeps hover ranges/types coherent when another document is checked", () => {
    const editor = adapter();
    try {
      const first = update(editor, representative);
      const otherText = source(
        "const f = defineShaderFunction((x: Expr<F32>) => x / 2);",
      );
      const other = editor.updateDocument({
        fileName: join(cwd, "other-local.shdr.ts"),
        source: otherText,
        version: 1,
        projectVersion: 1,
      });
      expect(other.diagnostics).toEqual([]);
      hover(first, representative, "level =", "Expr<F32>");
      hover(first, representative, "rgb, 1", "Expr<Vec3<F32>>");
      hover(other, otherText, "x /", "Expr<F32>");
    } finally {
      editor.dispose();
    }
  });

  it("maps original UTF-16 ranges after CRLF and non-BMP text", () => {
    const editor = adapter();
    try {
      const text = ("// 🎨\n" + representative).replaceAll("\n", "\r\n");
      const document = update(editor, text);
      expect(document.diagnostics).toEqual([]);
      hover(document, text, "level =", "Expr<F32>");
      hover(document, text, "rgb, 1", "Expr<Vec3<F32>>");
      const badText = text.replace("grain(p, seed)", "grain(seed, p)");
      const lowered = lowerFragment(badText);
      expect(lowered.ok).toBe(false);
      if (lowered.ok) return;
      const bad = update(editor, badText, 2);
      expect(bad.diagnostics).toEqual([
        expect.objectContaining({
          code: ShaderDiagnosticCode.InvalidShaderFunctionCall,
          range: {
            start: badText.indexOf("grain(seed, p)"),
            length: "grain(seed, p)".length,
          },
          message: lowered.diagnostics[0]!.message,
        }),
      ]);
    } finally {
      editor.dispose();
    }
  });

  it("delegates ordinary .ts even when it contains shader markers/operators", () => {
    const editor = adapter();
    try {
      const text = source("const f = defineShaderFunction((x) => x + 1);");
      const document = editor.updateDocument({
        fileName: join(cwd, "ordinary.ts"),
        source: text,
        version: 1,
        projectVersion: 1,
      });
      expect(document.delegated).toBe(true);
      expect(document.isShader).toBe(false);
      expect(document.diagnostics).toEqual([]);
      expect(
        document.getQuickInfoAtPosition(text.indexOf("f =")),
      ).toBeUndefined();
    } finally {
      editor.dispose();
    }
  });
});
