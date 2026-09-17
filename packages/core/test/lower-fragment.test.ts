import { describe, expect, it } from "vitest";

import {
  lowerFragment,
  ShaderDiagnosticCode,
  type TextRange,
} from "../src/index.js";
import { readShaderFixture } from "./read-shader-fixture.js";

const f32 = { kind: "scalar", scalar: "f32" } as const;
const vec2 = { kind: "vector", scalar: "f32", size: 2 } as const;
const vec4 = { kind: "vector", scalar: "f32", size: 4 } as const;

describe("lowerFragment", () => {
  it("deterministically parses, validates, types, and lowers the target shader", async () => {
    const source = await readShaderFixture("gradient");
    const first = lowerFragment(source);
    const second = lowerFragment(source);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const uvDeclarationStart = source.indexOf("const uv");
    const colorDeclarationStart = source.indexOf("const color");
    const callStart = source.indexOf("vec4(", colorDeclarationStart);
    const uvXStart = source.indexOf("uv.x", callStart);
    const uvYStart = source.indexOf("uv.y", uvXStart + 1);
    const returnStart = source.indexOf("return color");
    const callbackStart = source.indexOf("({ coord, uniforms }) =>");
    const callbackEnd = source.lastIndexOf("});") + 1;

    expect(first).toEqual({
      ok: true,
      diagnostics: [],
      ir: {
        kind: "shader-module",
        stage: "fragment",
        range: span(callbackStart, callbackEnd),
        statements: [
          {
            kind: "const-declaration",
            name: "uv",
            symbolId: 0,
            nameRange: rangeOf(source, "uv", uvDeclarationStart),
            range: rangeOf(
              source,
              "const uv = coord.xy / uniforms.resolution;",
            ),
            initializer: {
              kind: "binary",
              operator: "/",
              type: vec2,
              range: rangeOf(
                source,
                "coord.xy / uniforms.resolution",
                uvDeclarationStart,
              ),
              left: {
                kind: "swizzle",
                components: [0, 1],
                type: vec2,
                range: rangeOf(source, "coord.xy", uvDeclarationStart),
                expression: {
                  kind: "builtin-input",
                  input: "fragment-position",
                  type: vec4,
                  range: rangeOf(source, "coord", uvDeclarationStart),
                },
              },
              right: {
                kind: "default-uniform",
                uniform: "resolution",
                type: vec2,
                range: rangeOf(
                  source,
                  "uniforms.resolution",
                  uvDeclarationStart,
                ),
              },
            },
          },
          {
            kind: "const-declaration",
            name: "color",
            symbolId: 1,
            nameRange: rangeOf(source, "color", colorDeclarationStart),
            range: rangeOf(source, "const color = vec4(uv.x, uv.y, 0, 1);"),
            initializer: {
              kind: "call",
              target: { kind: "constructor", name: "vec4" },
              type: vec4,
              range: rangeOf(source, "vec4(uv.x, uv.y, 0, 1)", callStart),
              arguments: [
                {
                  kind: "swizzle",
                  components: [0],
                  type: f32,
                  range: rangeOf(source, "uv.x", uvXStart),
                  expression: {
                    kind: "local-reference",
                    name: "uv",
                    symbolId: 0,
                    type: vec2,
                    range: rangeOf(source, "uv", uvXStart),
                  },
                },
                {
                  kind: "swizzle",
                  components: [1],
                  type: f32,
                  range: rangeOf(source, "uv.y", uvYStart),
                  expression: {
                    kind: "local-reference",
                    name: "uv",
                    symbolId: 0,
                    type: vec2,
                    range: rangeOf(source, "uv", uvYStart),
                  },
                },
                {
                  kind: "numeric-literal",
                  value: 0,
                  type: f32,
                  range: rangeOf(source, "0", uvYStart + "uv.y".length),
                },
                {
                  kind: "numeric-literal",
                  value: 1,
                  type: f32,
                  range: rangeOf(source, "1", uvYStart + "uv.y".length),
                },
              ],
            },
          },
          {
            kind: "return-statement",
            range: rangeOf(source, "return color;", returnStart),
            expression: {
              kind: "local-reference",
              name: "color",
              symbolId: 1,
              type: vec4,
              range: rangeOf(source, "color", returnStart),
            },
          },
        ],
      },
    });
  });

  it("returns validation diagnostics in original-source coordinates", () => {
    const expression = "coord.x + uniforms.time";
    const source = shaderSource(`return vec4(${expression});`);

    expect(lowerFragment(source)).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.UnsupportedOperator,
          message:
            'The "+" binary operator is not supported; the POC supports only division.',
          range: rangeOf(source, expression),
          severity: "error",
        },
      ],
    });
  });

  it("returns semantic diagnostics in original-source coordinates", () => {
    const expression = "uniforms.time / uniforms.resolution";
    const source = shaderSource(`
  const invalid = ${expression};
  return coord;`);

    expect(lowerFragment(source)).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidBinaryOperation,
          message:
            'Operator "/" cannot be applied to types "Expr<F32>" and "Expr<Vec2<F32>>".',
          range: rangeOf(source, expression),
          severity: "error",
        },
      ],
    });
  });
});

function shaderSource(body: string): string {
  return `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});
`;
}

function rangeOf(source: string, text: string, from = 0): TextRange {
  const start = source.indexOf(text, from);
  if (start < 0) throw new Error(`Expected source to contain ${text}.`);
  return { start, length: text.length };
}

function span(start: number, end: number): TextRange {
  return { start, length: end - start };
}
