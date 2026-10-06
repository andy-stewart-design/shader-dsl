import { expect, it } from "vitest";

import { compileFragmentArtifact } from "../src/compile-fragment-artifact.js";
import { lowerFragment } from "../src/index.js";

function shader(expression: string): string {
  return `import { createFragmentShader, smoothstep, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const value = ${expression};
  return coord;
});`;
}

it("preserves scalar-left operand order, color swizzle indices, and constructor shapes in neutral IR", () => {
  const source = shader("1 - vec3(coord.rg, uniforms.time) + 0.1");
  const lowered = lowerFragment(source);
  expect(lowered.ok).toBe(true);
  if (!lowered.ok) return;
  expect(lowered.ir.statements[0]).toMatchObject({
    kind: "const-declaration",
    initializer: {
      kind: "binary",
      operator: "+",
      type: { kind: "vector", size: 3 },
      left: {
        kind: "binary",
        operator: "-",
        left: { kind: "numeric-literal", value: 1 },
        right: {
          kind: "call",
          target: { kind: "constructor", name: "vec3" },
          arguments: [
            { kind: "swizzle", components: [0, 1] },
            { kind: "default-uniform", uniform: "time" },
          ],
        },
      },
      right: { kind: "numeric-literal", value: 0.1 },
    },
  });
  expect(JSON.stringify(lowered.ir)).not.toMatch(
    /\brgba\b|\bgl_FragCoord\b|vec3<f32>/,
  );

  const compiled = compileFragmentArtifact(source);
  expect(compiled.ok).toBe(true);
  if (!compiled.ok) return;
  expect(compiled.artifact.glsl).toContain("1.0 - vec3(shdr_coord.xy, u_time)");
  expect(compiled.artifact.wgsl).toContain(
    "vec3<f32>(1.0f) - vec3<f32>(shdr_coord.xy, shdr_time)",
  );
});

it.each(["vec2", "vec3", "vec4"])(
  "detects equal smoothstep edges from scalar-left %s arithmetic after f32 folding",
  (constructor) => {
    const expression = `smoothstep(1 - ${constructor}(0.75), ${constructor}(0.25), ${constructor}(uniforms.time))`;
    const source = shader(expression);
    const lowered = lowerFragment(source);
    expect(lowered.ok).toBe(false);
    if (lowered.ok) return;
    expect(lowered.diagnostics).toEqual([
      expect.objectContaining({
        code: "SHDR1209",
        range: { start: source.indexOf(expression), length: expression.length },
      }),
    ]);
  },
);

it.each([
  ["coord.xr", "SHDR1204"],
  ["coord.rgb.a", "SHDR1204"],
  ["vec3(coord.x, coord.rg)", "SHDR1206"],
  ["coord.rg - coord.rgb", "SHDR1205"],
])("reports %s at an original-source range (%s)", (expression, code) => {
  const source = shader(expression);
  const result = lowerFragment(source);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.diagnostics[0]?.code).toBe(code);
  const range = result.diagnostics[0]!.range;
  const selected = source.slice(range.start, range.start + range.length);
  expect(selected).toBe(
    code === "SHDR1204"
      ? expression.slice(expression.lastIndexOf(".") + 1)
      : expression,
  );
});
