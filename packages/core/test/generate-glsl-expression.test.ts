import { describe, expect, it } from "vitest";

import type {
  ShaderExpression,
  ShaderValueType,
  TextRange,
} from "../src/index.js";
import { generateGlslExpression } from "../src/generate-glsl-expression.js";

const range: TextRange = { start: 0, length: 1 };
const f32 = { kind: "scalar", scalar: "f32" } as const;
const vec2 = { kind: "vector", scalar: "f32", size: 2 } as const;
const vec4 = { kind: "vector", scalar: "f32", size: 4 } as const;

const numeric = (value: number): ShaderExpression => ({
  kind: "numeric-literal",
  value,
  type: f32,
  range,
});

const uniform = (
  name: "resolution" | "mouse" | "time",
  type: ShaderValueType,
): ShaderExpression => ({
  kind: "default-uniform",
  uniform: name,
  type,
  range,
});

const divide = (
  left: ShaderExpression,
  right: ShaderExpression,
  type: ShaderValueType,
): ShaderExpression => ({
  kind: "binary",
  operator: "/",
  left,
  right,
  type,
  range,
});

describe("GLSL expression generation", () => {
  it.each([
    [0, "0.0"],
    [1, "1.0"],
    [2.5, "2.5"],
    [1e-7, "1e-7"],
    [-0, "-0.0"],
  ])("normalizes the numeric literal %s", (value, expected) => {
    expect(generateGlslExpression(numeric(value))).toEqual({
      code: expected,
      referencedUniforms: [],
      usesFragmentPosition: false,
    });
  });

  it("rejects non-finite values rather than emitting invalid GLSL", () => {
    expect(() => generateGlslExpression(numeric(Number.POSITIVE_INFINITY))).toThrow(
      "Cannot emit non-finite GLSL float Infinity.",
    );
  });

  it("emits every default uniform with stable dependency metadata", () => {
    const expression = divide(
      divide(
        uniform("mouse", vec2),
        uniform("resolution", vec2),
        vec2,
      ),
      uniform("time", f32),
      vec2,
    );

    expect(generateGlslExpression(expression)).toEqual({
      code: "((u_mouse / u_resolution) / u_time)",
      referencedUniforms: ["resolution", "mouse", "time"],
      usesFragmentPosition: false,
    });
  });

  it("groups nested division and preserves explicit floating-point semantics", () => {
    const leftAssociative = divide(
      divide(numeric(1), numeric(2), f32),
      uniform("time", f32),
      f32,
    );
    const rightAssociative = divide(
      numeric(1),
      divide(numeric(2), uniform("time", f32), f32),
      f32,
    );

    expect(generateGlslExpression(leftAssociative).code).toBe(
      "((1.0 / 2.0) / u_time)",
    );
    expect(generateGlslExpression(rightAssociative).code).toBe(
      "(1.0 / (2.0 / u_time))",
    );
  });

  it("emits local references, generic swizzles, and vec4 construction", () => {
    const local: ShaderExpression = {
      kind: "local-reference",
      name: "uv",
      symbolId: 0,
      type: vec4,
      range,
    };
    const swizzle: ShaderExpression = {
      kind: "swizzle",
      expression: local,
      components: [0, 1, 2, 3],
      type: vec4,
      range,
    };
    const call: ShaderExpression = {
      kind: "call",
      target: { kind: "constructor", name: "vec4" },
      arguments: [swizzle],
      type: vec4,
      range,
    };

    expect(generateGlslExpression(call)).toEqual({
      code: "vec4((uv).xyzw)",
      referencedUniforms: [],
      usesFragmentPosition: false,
    });
  });

  it("constructs canonical top-left fragment position and records resolution", () => {
    const coord: ShaderExpression = {
      kind: "builtin-input",
      input: "fragment-position",
      type: vec4,
      range,
    };

    expect(generateGlslExpression(coord)).toEqual({
      code: "vec4(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y, gl_FragCoord.z, gl_FragCoord.w)",
      referencedUniforms: ["resolution"],
      usesFragmentPosition: true,
    });
    expect(
      generateGlslExpression(coord, {
        fragmentPositionName: "shdr_coord",
      }).code,
    ).toBe("shdr_coord");
  });

  it("preserves half-integer pixel centers and reverses only the GLSL Y axis", () => {
    const resolutionY = 8;
    const canonicalY = (glFragmentY: number) =>
      resolutionY - glFragmentY;

    expect(canonicalY(resolutionY - 0.5)).toBe(0.5);
    expect(canonicalY(0.5)).toBe(resolutionY - 0.5);

    const coord = generateGlslExpression({
      kind: "builtin-input",
      input: "fragment-position",
      type: vec4,
      range,
    }).code;
    expect(coord).toContain("gl_FragCoord.x");
    expect(coord).toContain("u_resolution.y - gl_FragCoord.y");
    expect(coord).toContain("gl_FragCoord.z");
    expect(coord).toContain("gl_FragCoord.w");
  });
});
