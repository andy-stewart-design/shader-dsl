import { describe, expect, it } from "vitest";

import {
  lowerShaderSyntax,
  parseShaderFile,
  ShaderDiagnosticCode,
  type ShaderExpression,
  type ShaderReturnStatement,
  type ShaderValueType,
} from "../src/index.js";

function lowerReturnedExpression(expression: string): {
  readonly source: string;
  readonly result:
    | { readonly ok: true; readonly expression: ShaderExpression }
    | {
        readonly ok: false;
        readonly diagnostics: ReturnType<
          typeof lowerShaderSyntax
        >["diagnostics"];
      };
} {
  const source = `import { createFragmentShader } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  return ${expression};
});
`;
  const parsed = parseShaderFile(source, "swizzle.shdr.ts");
  expect(parsed.diagnostics).toEqual([]);
  expect(parsed.info).toBeDefined();

  const lowered = lowerShaderSyntax(parsed.info!.callback.syntax);
  if (!lowered.ok) {
    return {
      source,
      result: { ok: false, diagnostics: lowered.diagnostics },
    };
  }

  const returned = lowered.module.statements.at(-1) as
    ShaderReturnStatement | undefined;
  expect(returned?.kind).toBe("return-statement");
  if (!returned) throw new Error("Expected a lowered return statement.");
  return {
    source,
    result: { ok: true, expression: returned.expression },
  };
}

const vectors = [
  {
    source: "uniforms.resolution",
    type: { kind: "vector", scalar: "f32", size: 2 },
  },
  {
    source: "coord",
    type: { kind: "vector", scalar: "f32", size: 4 },
  },
] as const satisfies readonly {
  readonly source: string;
  readonly type: ShaderValueType;
}[];

const swizzles = [
  {
    property: "x",
    components: [0],
    type: { kind: "scalar", scalar: "f32" },
  },
  {
    property: "y",
    components: [1],
    type: { kind: "scalar", scalar: "f32" },
  },
  {
    property: "xy",
    components: [0, 1],
    type: { kind: "vector", scalar: "f32", size: 2 },
  },
] as const;

describe("swizzle lowering", () => {
  for (const vector of vectors) {
    for (const swizzle of swizzles) {
      it(`lowers ${vector.type.size}-component .${swizzle.property}`, () => {
        const expressionSource = `${vector.source}.${swizzle.property}`;
        const { source, result } = lowerReturnedExpression(expressionSource);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.expression).toMatchObject({
          kind: "swizzle",
          components: swizzle.components,
          type: swizzle.type,
          expression: { type: vector.type },
          range: {
            start: source.indexOf(expressionSource),
            length: expressionSource.length,
          },
        });
      });
    }
  }

  it("lowers a swizzle through a vector local reference", () => {
    const source = `import { createFragmentShader } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const local = uniforms.resolution;
  return local.xy;
});
`;
    const parsed = parseShaderFile(source, "local-swizzle.shdr.ts");
    expect(parsed.diagnostics).toEqual([]);
    if (!parsed.info) return;

    const result = lowerShaderSyntax(parsed.info.callback.syntax);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.module.statements.at(-1)).toMatchObject({
      kind: "return-statement",
      expression: {
        kind: "swizzle",
        components: [0, 1],
        type: { kind: "vector", scalar: "f32", size: 2 },
        expression: {
          kind: "local-reference",
          name: "local",
          symbolId: 0,
          type: { kind: "vector", scalar: "f32", size: 2 },
        },
      },
    });
  });

  it("rejects a scalar swizzle through a local reference", () => {
    const source = `import { createFragmentShader } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const scalar = uniforms.time;
  return scalar.x;
});
`;
    const parsed = parseShaderFile(source, "scalar-swizzle.shdr.ts");
    expect(parsed.diagnostics).toEqual([]);
    if (!parsed.info) return;

    const result = lowerShaderSyntax(parsed.info.callback.syntax);
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidSwizzle,
          message: 'Cannot apply swizzle ".x" to scalar type "F32".',
          range: { start: source.lastIndexOf(".x") + 1, length: 1 },
          severity: "error",
        },
      ],
    });
  });

  it("rejects a component unavailable on the receiver vector", () => {
    const expressionSource = "uniforms.resolution.z";
    const { source, result } = lowerReturnedExpression(expressionSource);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidSwizzle,
          message: 'Swizzle ".z" is not available on type "Vec2<F32>".',
          range: { start: source.indexOf(".z") + 1, length: 1 },
          severity: "error",
        },
      ],
    });
  });

  it("rejects an available component outside the POC swizzle set", () => {
    const expressionSource = "coord.z";
    const { source, result } = lowerReturnedExpression(expressionSource);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidSwizzle,
          message:
            'Swizzle ".z" is not supported; the POC supports only ".x", ".y", and ".xy".',
          range: { start: source.indexOf(".z") + 1, length: 1 },
          severity: "error",
        },
      ],
    });
  });

  it("rejects an unsupported multi-component spelling", () => {
    const expressionSource = "coord.yx";
    const { source, result } = lowerReturnedExpression(expressionSource);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: ShaderDiagnosticCode.InvalidSwizzle,
          message:
            'Swizzle ".yx" is not supported; the POC supports only ".x", ".y", and ".xy".',
          range: { start: source.indexOf(".yx") + 1, length: 2 },
        }),
      ],
    });
  });
});
