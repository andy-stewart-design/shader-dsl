import { describe, expect, it } from "vitest";
import {
  compileFragment,
  lowerFragment,
  ShaderDiagnosticCode,
} from "../src/index.js";

type Shape = "s" | "v2" | "v3" | "v4";
const shapes: readonly Shape[] = ["s", "v2", "v3", "v4"];
const names = ["asin", "acos", "atan", "radians", "degrees"] as const;
const imports = [...names, "createFragmentShader", "vec2", "vec3", "vec4"].join(
  ", ",
);

function source(call: string, shape: Shape = "s"): string {
  const result =
    shape === "s" ? `vec4(result, 0, 0, 1)` : `vec4(result.x, 0, 0, 1)`;
  return `import { ${imports} } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const result = ${call};
  return ${result};
});`;
}

function successful(
  result: ReturnType<typeof compileFragment>,
): asserts result is Extract<ReturnType<typeof compileFragment>, { ok: true }> {
  expect(result).toMatchObject({ ok: true, diagnostics: [] });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
}

const examples = names.flatMap((name) =>
  shapes.map((shape) => ({
    name,
    shape,
    call: `${name}(${shape})`,
  })),
);

describe("orbit unary math", () => {
  it("covers all twenty concrete unary signatures", () => {
    expect(examples).toHaveLength(20);
    expect(new Set(examples.map(({ call }) => call)).size).toBe(20);
  });

  for (const { name, shape, call } of examples) {
    it(`${call} lowers with the same result shape for both targets`, () => {
      const input = source(call, shape);
      const glsl = compileFragment(input, { target: "glsl-es-300" });
      const wgsl = compileFragment(input, { target: "wgsl" });
      successful(glsl);
      successful(wgsl);
      expect(glsl.ir).toEqual(wgsl.ir);
      expect(glsl.code).toContain(`${name}(`);
      expect(wgsl.code).toContain(`${name}(`);
      expect(JSON.stringify(glsl.ir)).toContain(`"name":"${name}"`);
    });
  }

  for (const [call, expected] of [
    ["asin(s, s)", ShaderDiagnosticCode.InvalidBuiltin],
    ["acos(v2, v2)", ShaderDiagnosticCode.InvalidBuiltin],
    ["atan(v2, v3)", ShaderDiagnosticCode.InvalidBuiltin],
    ["radians(s, s)", ShaderDiagnosticCode.InvalidBuiltin],
    ["degrees(v2, v2)", ShaderDiagnosticCode.InvalidBuiltin],
    ["asin(2)", ShaderDiagnosticCode.InvalidBuiltinDomain],
    ["acos(vec2(s, -2))", ShaderDiagnosticCode.InvalidBuiltinDomain],
    ["asin(3e38 + 3e38)", ShaderDiagnosticCode.InvalidBuiltinDomain],
  ] as const) {
    it(`diagnoses ${call} on the original call`, () => {
      const input = source(call);
      const result = lowerFragment(input);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: expected,
          range: { start: input.indexOf(call), length: call.length },
        }),
      ]);
    });
  }

  it("checks f32-rounded endpoints and partially known vector lanes", () => {
    expect(lowerFragment(source("asin(1 + 1e-50)")).ok).toBe(true);
    expect(lowerFragment(source("acos(-1 - 1e-50)")).ok).toBe(true);
    const input = source("asin(vec2(s, 2))");
    expect(lowerFragment(input)).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: ShaderDiagnosticCode.InvalidBuiltinDomain,
          range: { start: input.indexOf("asin(vec2(s, 2))"), length: 16 },
        }),
      ],
    });
  });

  it("keeps dynamic helper parameters as caller preconditions", () => {
    const input = `import { createFragmentShader, defineShaderFunction, asin, vec4 } from "shdr";
import type { Expr, F32 } from "shdr";
const angle = defineShaderFunction((value: Expr<F32>) => asin(value));
export default createFragmentShader(({ uniforms }) => vec4(angle(uniforms.time), 0, 0, 1));`;
    for (const target of ["glsl-es-300", "wgsl"] as const)
      successful(compileFragment(input, { target }));
  });
});
