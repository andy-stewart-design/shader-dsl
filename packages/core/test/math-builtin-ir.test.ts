import { expect, it } from "vitest";

import type {
  ShaderBuiltinFunctionName,
  ShaderCallExpression,
  ShaderExpression,
  ShaderModule,
  TextRange,
} from "../src/index.js";
import { generateGlslExpression } from "../src/generate-glsl-expression.js";
import { generateWgslExpression } from "../src/generate-wgsl-expression.js";
import { generateWgslFragment } from "../src/generate-wgsl-fragment.js";

const f32 = { kind: "scalar", scalar: "f32" } as const;
const vec4 = { kind: "vector", scalar: "f32", size: 4 } as const;
const range = (start: number, length: number): TextRange => ({ start, length });
const number = (value: number, start: number): ShaderExpression => ({
  kind: "numeric-literal",
  value,
  type: f32,
  range: range(start, 3),
});
const builtin = (
  name: ShaderBuiltinFunctionName,
  args: readonly ShaderExpression[],
  sourceRange: TextRange,
): ShaderCallExpression => ({
  kind: "call",
  target: { kind: "builtin-function", name },
  arguments: args,
  type: f32,
  range: sourceRange,
});

it("preserves nested builtin identities, argument order, f32 type and original ranges across both generators", () => {
  const sine = builtin("sin", [number(0, 15)], range(11, 7));
  const absolute = builtin("abs", [sine], range(7, 12));
  const fractional = builtin("fract", [number(0.375, 65)], range(59, 12));
  const edge = builtin(
    "smoothstep",
    [number(0, 39), number(1, 44), fractional],
    range(28, 44),
  );
  const outer = builtin("max", [absolute, edge], range(0, 74));
  const before = JSON.stringify(outer);
  expect(outer.arguments).toEqual([absolute, edge]);
  expect(outer.type).toEqual(f32);
  expect(edge.range).toEqual(range(28, 44));
  expect(edge.arguments.map((arg) => arg.range.start)).toEqual([39, 44, 59]);
  expect(before).not.toMatch(/gl_FragCoord|shdr_internal_|\bWGSL\b|\bGLSL\b/);

  expect(generateGlslExpression(outer).code).toBe(
    "max(abs(sin(0.0)), smoothstep(0.0, 1.0, fract(0.375)))",
  );
  expect(generateWgslExpression(outer)).toMatchObject({
    code: "max(abs(sin(0.0)), shdr_internal_smoothstep_f32(0.0, 1.0, fract(0.375)))",
    smoothstepShapes: ["f32"],
  });
  const module: ShaderModule = {
    kind: "shader-module",
    stage: "fragment",
    statements: [
      {
        kind: "return-statement",
        expression: {
          kind: "call",
          target: { kind: "constructor", name: "vec4" },
          arguments: [outer, number(0, 75), number(0, 78), number(1, 81)],
          type: vec4,
          range: range(0, 84),
        },
        range: range(0, 84),
      },
    ],
    range: range(0, 84),
  };
  expect(
    generateWgslFragment(module).match(/fn shdr_internal_smoothstep_f32\(/g),
  ).toHaveLength(1);
  expect(JSON.stringify(outer)).toBe(before);
});

it("both generators fail closed on an unknown directly constructed builtin identity", () => {
  const expression = builtin("sin", [number(0, 3)], range(0, 7));
  const unknown = {
    ...expression,
    target: { kind: "builtin-function", name: "textureSample" },
  } as unknown as ShaderExpression;
  expect(() => generateGlslExpression(unknown)).toThrow(
    "Unsupported GLSL IR value",
  );
  expect(() => generateWgslExpression(unknown)).toThrow(
    "Unsupported WGSL IR value",
  );
});
