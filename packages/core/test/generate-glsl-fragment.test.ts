import { describe, expect, it } from "vitest";

import { lowerFragment } from "../src/index.js";
import { generateGlslFragment } from "../src/generate-glsl-fragment.js";
import { readShaderFixture } from "./read-shader-fixture.js";

describe("GLSL fragment module generation", () => {
  it("generates the complete target fragment shader", async () => {
    const source = await readShaderFixture("gradient");
    const lowered = lowerFragment(source);
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;

    expect(generateGlslFragment(lowered.ir)).toBe(`#version 300 es
precision highp float;

uniform vec2 u_resolution;

out vec4 shdr_fragment_color;

void main() {
  vec4 shdr_coord = vec4(
    gl_FragCoord.x,
    u_resolution.y - gl_FragCoord.y,
    gl_FragCoord.z,
    gl_FragCoord.w
  );
  vec2 uv = ((shdr_coord).xy / u_resolution);
  vec4 color = vec4((uv).x, (uv).y, 0.0, 1.0);
  shdr_fragment_color = color;
}
`);
  });

  it("emits only referenced default uniforms", async () => {
    const source = await readShaderFixture("gradient");
    const lowered = lowerFragment(source);
    if (!lowered.ok) throw new Error("Expected the target shader to lower.");

    const glsl = generateGlslFragment(lowered.ir);
    expect(glsl).toContain("uniform vec2 u_resolution;");
    expect(glsl).not.toContain("u_mouse");
    expect(glsl).not.toContain("u_time");
  });

  it("emits resolution when coord is used without an explicit uniform read", () => {
    const source = shaderSource("return vec4(coord.x, coord.y, 0, 1);");
    expect(source).not.toContain("uniforms.resolution");
    const lowered = lowerFragment(source);
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;

    const glsl = generateGlslFragment(lowered.ir);
    expect(glsl).toContain("uniform vec2 u_resolution;");
    expect(glsl).toContain("u_resolution.y - gl_FragCoord.y");
    expect(glsl).toContain("vec4 shdr_coord = vec4(");
  });

  it("emits all explicitly referenced uniforms in deterministic order", () => {
    const lowered = lowerFragment(
      shaderSource(`const mouse = uniforms.mouse / uniforms.resolution;
  const scaledTime = uniforms.time / uniforms.time;
  return vec4(mouse, scaledTime, 1);`),
    );
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;

    const first = generateGlslFragment(lowered.ir);
    const second = generateGlslFragment(lowered.ir);
    expect(first).toBe(second);
    expect(first).toContain(`uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;`);
  });

  it("omits the coordinate setup and uniforms when neither is referenced", () => {
    const lowered = lowerFragment(shaderSource("return vec4(1);"));
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;

    expect(generateGlslFragment(lowered.ir)).toBe(`#version 300 es
precision highp float;

out vec4 shdr_fragment_color;

void main() {
  shdr_fragment_color = vec4(1.0);
}
`);
  });
});

function shaderSource(body: string): string {
  return `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});
`;
}
