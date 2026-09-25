import { describe, expect, it } from "vitest";

import {
  lowerShaderSyntax,
  parseShaderFile,
  ShaderDiagnosticCode,
  type ShaderConstDeclaration,
  type ShaderExpression,
  type ShaderValueType,
} from "../src/index.js";

function lowerTestExpression(expression: string): {
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
  const result = ${expression};
  return coord;
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

  const declaration = lowered.module.statements[0] as
    ShaderConstDeclaration | undefined;
  expect(declaration?.kind).toBe("const-declaration");
  if (!declaration) throw new Error("Expected a lowered const declaration.");
  return {
    source,
    result: { ok: true, expression: declaration.initializer },
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
        const { source, result } = lowerTestExpression(expressionSource);
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
  const result = local.xy;
  return coord;
});
`;
    const parsed = parseShaderFile(source, "local-swizzle.shdr.ts");
    expect(parsed.diagnostics).toEqual([]);
    if (!parsed.info) return;

    const result = lowerShaderSyntax(parsed.info.callback.syntax);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.module.statements[1]).toMatchObject({
      kind: "const-declaration",
      initializer: {
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
  const result = scalar.x;
  return coord;
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
    const { source, result } = lowerTestExpression(expressionSource);

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

  it("rejects a non-xyzw spelling", () => {
    const expressionSource = "coord.rgba";
    const { source, result } = lowerTestExpression(expressionSource);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidSwizzle,
          message:
            'Swizzle ".rgba" is not supported; use one to four xyzw components.',
          range: { start: source.indexOf(".rgba") + 1, length: 4 },
          severity: "error",
        },
      ],
    });
  });

  it("rejects an unsupported multi-component spelling", () => {
    const expressionSource = "coord.xyzwx";
    const { source, result } = lowerTestExpression(expressionSource);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: ShaderDiagnosticCode.InvalidSwizzle,
          message:
            'Swizzle ".xyzwx" is not supported; use one to four xyzw components.',
          range: { start: source.indexOf(".xyzwx") + 1, length: 5 },
        }),
      ],
    });
  });
});
