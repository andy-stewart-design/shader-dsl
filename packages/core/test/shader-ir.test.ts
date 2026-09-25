import { describe, expect, it } from "vitest";

import type {
  ShaderExpression,
  ShaderModule,
  ShaderScalarType,
  ShaderVectorType,
} from "../src/index.js";

const f32 = {
  kind: "scalar",
  scalar: "f32",
} as const satisfies ShaderScalarType;

const vec2f = {
  kind: "vector",
  scalar: "f32",
  size: 2,
} as const satisfies ShaderVectorType;

const vec3f = {
  kind: "vector",
  scalar: "f32",
  size: 3,
} as const satisfies ShaderVectorType;

const vec4f = {
  kind: "vector",
  scalar: "f32",
  size: 4,
} as const satisfies ShaderVectorType;

const range = (start: number, length = 1) => ({ start, length });

const module = {
  kind: "shader-module",
  stage: "fragment",
  range: range(50, 150),
  statements: [
    {
      kind: "const-declaration",
      name: "uv",
      symbolId: 0,
      nameRange: range(60, 2),
      range: range(54, 42),
      initializer: {
        kind: "binary",
        operator: "/",
        type: vec2f,
        range: range(65, 30),
        left: {
          kind: "swizzle",
          type: vec2f,
          range: range(65, 8),
          expression: {
            kind: "builtin-input",
            input: "fragment-position",
            type: vec4f,
            range: range(65, 5),
          },
          components: [0, 1],
        },
        right: {
          kind: "default-uniform",
          uniform: "resolution",
          type: vec2f,
          range: range(76, 19),
        },
      },
    },
    {
      kind: "const-declaration",
      name: "color",
      symbolId: 1,
      nameRange: range(105, 5),
      range: range(99, 46),
      initializer: {
        kind: "call",
        target: { kind: "constructor", name: "vec4" },
        type: vec4f,
        range: range(113, 31),
        arguments: [
          {
            kind: "swizzle",
            type: f32,
            range: range(118, 4),
            expression: {
              kind: "local-reference",
              name: "uv",
              symbolId: 0,
              type: vec2f,
              range: range(118, 2),
            },
            components: [0],
          },
          {
            kind: "swizzle",
            type: f32,
            range: range(124, 4),
            expression: {
              kind: "local-reference",
              name: "uv",
              symbolId: 0,
              type: vec2f,
              range: range(124, 2),
            },
            components: [1],
          },
          {
            kind: "numeric-literal",
            value: 0,
            type: f32,
            range: range(130),
          },
          {
            kind: "numeric-literal",
            value: 1,
            type: f32,
            range: range(133),
          },
        ],
      },
    },
    {
      kind: "return-statement",
      range: range(150, 13),
      expression: {
        kind: "local-reference",
        name: "color",
        symbolId: 1,
        type: vec4f,
        range: range(157, 5),
      },
    },
  ],
} as const satisfies ShaderModule;

describe("target-neutral shader IR", () => {
  it("represents the target shader with typed generic nodes", () => {
    const uv = module.statements[0];
    const color = module.statements[1];
    const returned = module.statements[2];

    expect(uv.kind).toBe("const-declaration");
    expect(uv.initializer).toMatchObject({
      kind: "binary",
      operator: "/",
      type: vec2f,
      left: {
        kind: "swizzle",
        components: [0, 1],
        expression: {
          kind: "builtin-input",
          input: "fragment-position",
          type: vec4f,
        },
      },
      right: {
        kind: "default-uniform",
        uniform: "resolution",
        type: vec2f,
      },
    });

    expect(color.kind).toBe("const-declaration");
    expect(color.initializer).toMatchObject({
      kind: "call",
      target: { kind: "constructor", name: "vec4" },
      type: vec4f,
    });
    if (color.initializer.kind !== "call") {
      throw new Error("Expected a generic call expression.");
    }
    expect(color.initializer.arguments).toHaveLength(4);
    expect(color.initializer.arguments[0]).toMatchObject({
      kind: "swizzle",
      components: [0],
      expression: { kind: "local-reference", symbolId: uv.symbolId },
    });

    expect(returned).toMatchObject({
      kind: "return-statement",
      expression: {
        kind: "local-reference",
        symbolId: color.symbolId,
        type: vec4f,
      },
    });
  });

  it("is source-ranged, serializable, and free of target spellings", () => {
    const expressions = collectExpressions(module);
    expect(expressions.length).toBeGreaterThan(0);
    for (const expression of expressions) {
      expect(expression.range.start).toBeGreaterThanOrEqual(0);
      expect(expression.range.length).toBeGreaterThan(0);
      expect(expression.type).toMatchObject({ scalar: "f32" });
    }

    const serialized = JSON.stringify(module);
    expect(JSON.parse(serialized)).toEqual(module);
    expect(serialized).not.toMatch(
      /gl_FragCoord|u_resolution|#version|@builtin|@location|vec[234]<f32>/,
    );
  });

  it("can represent a vector dimension not yet accepted from source", () => {
    expect(vec3f).toEqual({
      kind: "vector",
      scalar: "f32",
      size: 3,
    });
  });
});

function collectExpressions(shader: ShaderModule): readonly ShaderExpression[] {
  const expressions: ShaderExpression[] = [];

  const visit = (expression: ShaderExpression): void => {
    expressions.push(expression);
    switch (expression.kind) {
      case "numeric-literal":
      case "builtin-input":
      case "default-uniform":
      case "local-reference":
        return;
      case "swizzle":
        visit(expression.expression);
        return;
      case "binary":
        visit(expression.left);
        visit(expression.right);
        return;
      case "unary":
        visit(expression.argument);
        return;
      case "call":
        for (const argument of expression.arguments) visit(argument);
        return;
      default:
        return assertNever(expression);
    }
  };

  for (const statement of shader.statements) {
    switch (statement.kind) {
      case "const-declaration":
        visit(statement.initializer);
        break;
      case "return-statement":
        visit(statement.expression);
        break;
      default:
        assertNever(statement);
    }
  }

  return expressions;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled shader IR node: ${JSON.stringify(value)}`);
}
