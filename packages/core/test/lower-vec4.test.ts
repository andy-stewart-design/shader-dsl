import { describe, expect, it } from "vitest";

import {
  lowerShaderSyntax,
  parseShaderFile,
  ShaderDiagnosticCode,
  type ShaderCallbackSyntax,
  type ShaderConstDeclaration,
  type ShaderReturnStatement,
} from "../src/index.js";

function lowerSource(body: string) {
  const source = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
${body}
});
`;
  const parsed = parseShaderFile(source, "vec4-lowering.shdr.ts");
  expect(parsed.diagnostics).toEqual([]);
  expect(parsed.info).toBeDefined();
  return { source, result: lowerShaderSyntax(parsed.info!.callback.syntax) };
}

describe("vec4 and final-return lowering", () => {
  it("lowers the four-scalar constructor and links its returned local", () => {
    const callSource = "vec4(coord.x, coord.y, 0, 1)";
    const { source, result } = lowerSource(`
  const color = ${callSource};
  return color;`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const declaration = result.module.statements[0] as ShaderConstDeclaration;
    const returned = result.module.statements[1] as ShaderReturnStatement;
    expect(declaration).toMatchObject({
      kind: "const-declaration",
      name: "color",
      symbolId: 0,
      initializer: {
        kind: "call",
        target: { kind: "constructor", name: "vec4" },
        type: { kind: "vector", scalar: "f32", size: 4 },
        range: { start: source.indexOf(callSource), length: callSource.length },
      },
    });
    if (declaration.initializer.kind !== "call") {
      throw new Error("Expected a lowered call expression.");
    }
    expect(declaration.initializer.arguments).toHaveLength(4);
    expect(
      declaration.initializer.arguments.map((argument) => argument.type),
    ).toEqual([
      { kind: "scalar", scalar: "f32" },
      { kind: "scalar", scalar: "f32" },
      { kind: "scalar", scalar: "f32" },
      { kind: "scalar", scalar: "f32" },
    ]);
    expect(returned).toMatchObject({
      kind: "return-statement",
      expression: {
        kind: "local-reference",
        name: "color",
        symbolId: declaration.symbolId,
        type: declaration.initializer.type,
      },
    });
  });

  it("lowers vec4(uv.xy, 0, 1) through the complete target pipeline", () => {
    const callSource = "vec4(uv.xy, 0, 1)";
    const { source, result } = lowerSource(`
  const uv = coord.xy / uniforms.resolution;
  return ${callSource};`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const returned = result.module.statements.at(-1);
    expect(returned).toMatchObject({
      kind: "return-statement",
      expression: {
        kind: "call",
        target: { kind: "constructor", name: "vec4" },
        type: { kind: "vector", scalar: "f32", size: 4 },
        range: { start: source.indexOf(callSource), length: callSource.length },
        arguments: [
          {
            kind: "swizzle",
            components: [0, 1],
            type: { kind: "vector", scalar: "f32", size: 2 },
            expression: {
              kind: "local-reference",
              name: "uv",
              symbolId: 0,
            },
          },
          { kind: "numeric-literal", value: 0 },
          { kind: "numeric-literal", value: 1 },
        ],
      },
    });
  });

  it.each([
    {
      name: "scalar splat",
      call: "vec4(uniforms.time)",
      argument: {
        kind: "default-uniform",
        uniform: "time",
        type: { kind: "scalar", scalar: "f32" },
      },
    },
    {
      name: "Vec4 copy",
      call: "vec4(coord)",
      argument: {
        kind: "builtin-input",
        input: "fragment-position",
        type: { kind: "vector", scalar: "f32", size: 4 },
      },
    },
  ])("lowers the $name constructor", ({ call, argument }) => {
    const { source, result } = lowerSource(`
  return ${call};`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.module.statements.at(-1)).toMatchObject({
      kind: "return-statement",
      expression: {
        kind: "call",
        target: { kind: "constructor", name: "vec4" },
        arguments: [argument],
        type: { kind: "vector", scalar: "f32", size: 4 },
        range: { start: source.indexOf(call), length: call.length },
      },
    });
  });

  it.each([
    {
      name: "single Vec2",
      call: "vec4(uniforms.resolution)",
      types: "Expr<Vec2<F32>>",
    },
    {
      name: "wrong arity",
      call: "vec4(coord.x, 0, 1)",
      types: "Expr<F32>, Expr<F32>, Expr<F32>",
    },
    {
      name: "unsupported vector position",
      call: "vec4(coord.x, coord.xy, 0, 1)",
      types: "Expr<F32>, Expr<Vec2<F32>>, Expr<F32>, Expr<F32>",
    },
    {
      name: "unsupported Vec4 head",
      call: "vec4(coord, 0, 1)",
      types: "Expr<Vec4<F32>>, Expr<F32>, Expr<F32>",
    },
  ])("rejects $name", ({ call, types }) => {
    const { source, result } = lowerSource(`
  const color = ${call};
  return coord;`);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidConstructor,
          message: `No matching "vec4" constructor for argument types (${types}).`,
          range: { start: source.indexOf(call), length: call.length },
          severity: "error",
        },
      ],
    });
  });

  it("rejects an unsupported semantic call target", () => {
    const syntax: ShaderCallbackSyntax = {
      range: { start: 0, length: 40 },
      declarations: [],
      returnRange: { start: 0, length: 30 },
      returnExpression: {
        kind: "call-expression",
        calleeName: "smoothstep",
        calleeRange: { start: 7, length: 10 },
        arguments: [],
        range: { start: 7, length: 12 },
      },
    };

    expect(lowerShaderSyntax(syntax)).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.UnsupportedCall,
          message:
            'Unsupported shader call "smoothstep"; supported constructors are "vec2", "vec3", and "vec4".',
          range: { start: 7, length: 10 },
          severity: "error",
        },
      ],
    });
  });

  it("requires the final expression to be Vec4<F32>", () => {
    const expression = "coord.xy";
    const { source, result } = lowerSource(`
  return ${expression};`);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidReturnType,
          message:
            'Fragment shaders must return "Expr<Vec4<F32>>"; received "Expr<Vec2<F32>>".',
          range: {
            start: source.indexOf(expression),
            length: expression.length,
          },
          severity: "error",
        },
      ],
    });
  });
});
