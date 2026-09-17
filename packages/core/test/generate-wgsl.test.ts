import { describe, expect, it } from "vitest";

import type {
  ShaderExpression,
  ShaderValueType,
  TextRange,
} from "../src/index.js";
import { generateWgslExpression } from "../src/generate-wgsl-expression.js";
import { generateWgslFragment } from "../src/generate-wgsl-fragment.js";
import { lowerFragment } from "../src/lower-fragment.js";
import { readShaderFixture } from "./read-shader-fixture.js";

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

const local = (
  name: string,
  symbolId: number,
  type: ShaderValueType,
): ShaderExpression => ({
  kind: "local-reference",
  name,
  symbolId,
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

describe("WGSL expression generation", () => {
  it.each([
    [0, "0.0"],
    [1, "1.0"],
    [2.5, "2.5"],
    [1e-7, "1e-7"],
    [-0, "-0.0"],
  ])("normalizes the numeric literal %s", (value, expected) => {
    expect(generateWgslExpression(numeric(value))).toEqual({
      code: expected,
      referencedUniforms: [],
      usesFragmentPosition: false,
    });
  });

  it("rejects non-finite values rather than emitting invalid WGSL", () => {
    expect(() =>
      generateWgslExpression(numeric(Number.NEGATIVE_INFINITY)),
    ).toThrow("Cannot emit non-finite WGSL float -Infinity.");
  });

  it("fully groups nested division", () => {
    const time: ShaderExpression = {
      kind: "default-uniform",
      uniform: "time",
      type: f32,
      range,
    };
    const left = divide(divide(numeric(1), numeric(2), f32), time, f32);
    const right = divide(numeric(1), divide(numeric(2), time, f32), f32);

    expect(generateWgslExpression(left)).toEqual({
      code: "((1.0 / 2.0) / shdr_time)",
      referencedUniforms: ["time"],
      usesFragmentPosition: false,
    });
    expect(generateWgslExpression(right).code).toBe(
      "(1.0 / (2.0 / shdr_time))",
    );
  });

  it("uses fragment position directly without an implicit uniform", () => {
    const coord: ShaderExpression = {
      kind: "builtin-input",
      input: "fragment-position",
      type: vec4,
      range,
    };

    expect(generateWgslExpression(coord)).toEqual({
      code: "shdr_coord",
      referencedUniforms: [],
      usesFragmentPosition: true,
    });
  });

  it("emits local swizzles and every accepted vec4 constructor shape", () => {
    const uv = local("uv", 0, vec2);
    const color = local("color", 1, vec4);
    const uvX: ShaderExpression = {
      kind: "swizzle",
      expression: uv,
      components: [0],
      type: f32,
      range,
    };
    const call = (
      args: readonly ShaderExpression[],
    ): ShaderExpression => ({
      kind: "call",
      target: { kind: "constructor", name: "vec4" },
      arguments: args,
      type: vec4,
      range,
    });

    expect(generateWgslExpression(call([uvX, uvX, numeric(0), numeric(1)])).code).toBe(
      "vec4<f32>((uv).x, (uv).x, 0.0, 1.0)",
    );
    expect(generateWgslExpression(call([uv, numeric(0), numeric(1)])).code).toBe(
      "vec4<f32>(uv, 0.0, 1.0)",
    );
    expect(generateWgslExpression(call([numeric(1)])).code).toBe(
      "vec4<f32>(1.0)",
    );
    expect(generateWgslExpression(call([color])).code).toBe(
      "vec4<f32>(color)",
    );
  });
});

describe("WGSL fragment module generation", () => {
  it("generates the complete target module from existing typed IR", async () => {
    const source = await readShaderFixture("gradient");
    const lowered = lowerFragment(source);
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;

    expect(generateWgslFragment(lowered.ir)).toBe(`@group(0) @binding(0) var<uniform> shdr_resolution: vec2<f32>;

@fragment
fn shdr_fragment_main(
  @builtin(position) shdr_coord: vec4<f32>,
) -> @location(0) vec4<f32> {
  let uv: vec2<f32> = ((shdr_coord).xy / shdr_resolution);
  let color: vec4<f32> = vec4<f32>((uv).x, (uv).y, 0.0, 1.0);
  return color;
}
`);
  });

  it("uses direct fragment position without coordinate conversion or resolution", () => {
    const lowered = lowerFragment(
      shaderSource("return vec4(coord.x, coord.y, 0, 1);"),
    );
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;

    const wgsl = generateWgslFragment(lowered.ir);
    expect(wgsl).toContain("@builtin(position) shdr_coord: vec4<f32>");
    expect(wgsl).not.toContain("shdr_resolution");
    expect(wgsl).not.toContain("gl_FragCoord");
    expect(wgsl).not.toContain("shdr_coord.y -");
  });

  it("assigns fixed bindings without renumbering referenced uniforms", () => {
    const allUniforms = lowerFragment(
      shaderSource(`const mouse = uniforms.mouse / uniforms.resolution;
  const scaledTime = uniforms.time / uniforms.time;
  return vec4(mouse, scaledTime, 1);`),
    );
    expect(allUniforms.ok).toBe(true);
    if (!allUniforms.ok) return;

    expect(generateWgslFragment(allUniforms.ir)).toContain(`@group(0) @binding(0) var<uniform> shdr_resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> shdr_mouse: vec2<f32>;
@group(0) @binding(2) var<uniform> shdr_time: f32;`);

    const mouseOnly = lowerFragment(
      shaderSource("return vec4(uniforms.mouse, 0, 1);"),
    );
    expect(mouseOnly.ok).toBe(true);
    if (!mouseOnly.ok) return;
    const mouseWgsl = generateWgslFragment(mouseOnly.ir);
    expect(mouseWgsl).toContain(
      "@group(0) @binding(1) var<uniform> shdr_mouse: vec2<f32>;",
    );
    expect(mouseWgsl).not.toContain("@binding(0)");
  });

  it("emits no target contamination or unused entry-point parameter", () => {
    const lowered = lowerFragment(shaderSource("return vec4(1);"));
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;

    const wgsl = generateWgslFragment(lowered.ir);
    expect(wgsl).toBe(`@fragment
fn shdr_fragment_main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0);
}
`);
    expect(wgsl).not.toMatch(/#version|uniform\s|gl_FragCoord|out vec4/);
  });
});

function shaderSource(body: string): string {
  return `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});
`;
}
