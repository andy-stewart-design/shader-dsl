import { describe, expect, it } from "vitest";
import { compileFragmentArtifact } from "../src/browser.js";
import {
  compileFragment,
  generateFragment,
  lowerFragment,
  ShaderDiagnosticCode,
} from "../src/index.js";

function source(body: string): string {
  return `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});`;
}

describe("dual-target fragment artifact", () => {
  it.each([
    {
      name: "constants only",
      body: "return vec4(1, 0, 0, 1);",
      glsl: [],
      wgsl: [],
    },
    {
      name: "coord uses implicit GLSL resolution only",
      body: "return coord;",
      glsl: ["resolution"],
      wgsl: [],
    },
    {
      name: "time alone does not renumber WGSL binding 2",
      body: "return vec4(uniforms.time);",
      glsl: ["time"],
      wgsl: ["time"],
    },
    {
      name: "mouse alone does not renumber WGSL binding 1",
      body: "return vec4(uniforms.mouse, 0, 1);",
      glsl: ["mouse"],
      wgsl: ["mouse"],
    },
    {
      name: "nested expressions in declarations are included",
      body: "const pos = coord.xy; const shade = pos + uniforms.mouse; return vec4(shade, uniforms.time, 1);",
      glsl: ["resolution", "mouse", "time"],
      wgsl: ["mouse", "time"],
    },
    {
      name: "explicit resolution is used on both targets",
      body: "return vec4(uniforms.resolution, 0, 1);",
      glsl: ["resolution"],
      wgsl: ["resolution"],
    },
  ])(
    "derives $name from IR and matches generated declarations",
    ({ body, glsl, wgsl }) => {
      const compiled = compileFragmentArtifact(source(body));
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;

      expect(compiled.artifact.defaults).toEqual({ glsl, wgsl });
      expect(Object.keys(compiled.artifact)).toEqual([
        "glsl",
        "wgsl",
        "defaults",
      ]);
      expect(JSON.parse(JSON.stringify(compiled.artifact))).toEqual(
        compiled.artifact,
      );
      for (const [name, binding] of [
        ["resolution", 0],
        ["mouse", 1],
        ["time", 2],
      ] as const) {
        expect(
          compiled.artifact.glsl.includes(
            `uniform ${name === "time" ? "float" : "vec2"} u_${name};`,
          ),
        ).toBe(glsl.includes(name));
        expect(
          compiled.artifact.wgsl.includes(
            `@group(0) @binding(${binding}) var<uniform> shdr_${name}:`,
          ),
        ).toBe(wgsl.includes(name));
      }
    },
  );

  it("generates both targets from unchanged semantic IR", () => {
    const text = source(
      "const pos = coord.xy; return vec4(pos / uniforms.resolution, 0, 1);",
    );
    const lowered = lowerFragment(text);
    if (!lowered.ok) throw new Error("Expected successful lowering.");
    const before = JSON.stringify(lowered.ir);
    const artifact = compileFragmentArtifact(text);
    if (!artifact.ok) throw new Error("Expected a compiled artifact.");
    expect(artifact.artifact.glsl).toBe(
      generateFragment(lowered.ir, "glsl-es-300"),
    );
    expect(artifact.artifact.wgsl).toBe(generateFragment(lowered.ir, "wgsl"));
    expect(JSON.stringify(lowered.ir)).toBe(before);
    expect(compileFragmentArtifact(text)).toEqual(artifact);
  });

  it("preserves original-source diagnostics and produces no partial artifact", () => {
    const expression = "uniforms.time / uniforms.resolution";
    const text = source(`const bad = ${expression}; return coord;`);
    const compiled = compileFragmentArtifact(text);
    expect(compiled).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidBinaryOperation,
          message:
            'Operator "/" cannot be applied to types "Expr<F32>" and "Expr<Vec2<F32>>".',
          range: { start: text.indexOf(expression), length: expression.length },
          severity: "error",
        },
      ],
    });
    expect(compiled.ok).toBe(false);
    if (!compiled.ok) expect(compiled.artifact).toBeUndefined();
    const old = compileFragment(text, { target: "wgsl" });
    expect(compiled.diagnostics).toEqual(old.diagnostics);
  });
});
