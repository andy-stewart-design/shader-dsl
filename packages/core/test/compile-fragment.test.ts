import { describe, expect, it } from "vitest";

import {
  compileFragment,
  generateFragment,
  lowerFragment,
  ShaderDiagnosticCode,
  type ShaderTarget,
} from "../src/index.js";
import { readShaderFixture } from "./read-shader-fixture.js";

describe("public multi-target fragment compiler", () => {
  it("lowers once and generates both targets from that semantic result", async () => {
    const source = await readShaderFixture("gradient");
    const lowered = lowerFragment(source);
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;

    const before = JSON.stringify(lowered.ir);
    const glsl = generateFragment(lowered.ir, "glsl-es-300");
    const wgsl = generateFragment(lowered.ir, "wgsl");

    expect(glsl).toMatch(/^#version 300 es/);
    expect(wgsl).toContain("@fragment");
    expect(JSON.stringify(lowered.ir)).toBe(before);
  });

  it("compiles either explicit target while changing only generated output", async () => {
    const source = await readShaderFixture("gradient");
    const glsl = compileFragment(source, { target: "glsl-es-300" });
    const wgsl = compileFragment(source, { target: "wgsl" });

    expect(glsl.ok).toBe(true);
    expect(wgsl.ok).toBe(true);
    if (!glsl.ok || !wgsl.ok) return;

    expect(glsl.target).toBe("glsl-es-300");
    expect(wgsl.target).toBe("wgsl");
    expect(glsl.code).not.toBe(wgsl.code);
    expect(glsl.ir).toEqual(wgsl.ir);
    expect(glsl.diagnostics).toEqual(wgsl.diagnostics);
    expect(glsl.code).toBe(generateFragment(glsl.ir, glsl.target));
    expect(wgsl.code).toBe(generateFragment(wgsl.ir, wgsl.target));
  });

  it("is deterministic across repeated compilation", async () => {
    const source = await readShaderFixture("gradient");

    expect(compileFragment(source, { target: "glsl-es-300" })).toEqual(
      compileFragment(source, { target: "glsl-es-300" }),
    );
    expect(compileFragment(source, { target: "wgsl" })).toEqual(
      compileFragment(source, { target: "wgsl" }),
    );
  });

  it("returns original-source syntax diagnostics without IR or output", () => {
    const source = shaderSource("return vec4(0, 1, 0, 1;");
    const result = compileFragment(source, { target: "wgsl" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.target).toBe("wgsl");
    expect(result).not.toHaveProperty("code");
    expect(result).not.toHaveProperty("ir");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: ShaderDiagnosticCode.TypeScriptSyntax,
      severity: "error",
    });
    expect(result.diagnostics[0]!.range.start).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics[0]!.range.start).toBeLessThanOrEqual(
      source.length,
    );
  });

  it("returns original-source semantic diagnostics without IR or output", () => {
    const expression = "uniforms.time / uniforms.resolution";
    const source = shaderSource(`const invalid = ${expression};
  return coord;`);
    const result = compileFragment(source, { target: "glsl-es-300" });

    expect(result).toEqual({
      ok: false,
      target: "glsl-es-300",
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidBinaryOperation,
          message:
            'Operator "/" cannot be applied to types "Expr<F32>" and "Expr<Vec2<F32>>".',
          range: {
            start: source.indexOf(expression),
            length: expression.length,
          },
          severity: "error",
        },
      ],
    });
  });

  it("rejects unknown runtime target values instead of inferring a backend", async () => {
    const source = await readShaderFixture("gradient");
    const lowered = lowerFragment(source);
    if (!lowered.ok) throw new Error("Expected target source to lower.");
    const unknown = "metal" as ShaderTarget;

    expect(() => generateFragment(lowered.ir, unknown)).toThrowError(
      new RangeError(
        'Unknown shader target "metal"; expected "glsl-es-300" or "wgsl".',
      ),
    );
    expect(() => compileFragment(source, { target: unknown })).toThrowError(
      new RangeError(
        'Unknown shader target "metal"; expected "glsl-es-300" or "wgsl".',
      ),
    );
  });
});

function shaderSource(body: string): string {
  return `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});
`;
}
