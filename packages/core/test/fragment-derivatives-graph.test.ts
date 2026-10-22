import { describe, expect, it } from "vitest";

import { compileFragmentArtifact } from "../src/browser.js";
import { ShaderDiagnosticCode } from "../src/index.js";
import type { ShaderVirtualGraphInput } from "../src/index.js";

const derivativeHelpers = `import { defineShaderFunction, dFdx, dFdy, fwidth } from "shdr";
import type { Expr, F32, Mat2, Vec2, Vec3, Vec4 } from "shdr";
const mustNotExecute = (() => { throw new Error("AUTHORED_SOURCE_EXECUTED"); })();
export const scalar = defineShaderFunction((x: Expr<F32>) => dFdx(x) + dFdy(x) + fwidth(x));
export const vector2 = defineShaderFunction((x: Expr<Vec2<F32>>) => dFdx(x) + dFdy(x) + fwidth(x));
export const vector3 = defineShaderFunction((x: Expr<Vec3<F32>>) => dFdx(x) + dFdy(x) + fwidth(x));
export const vector4 = defineShaderFunction((x: Expr<Vec4<F32>>) => dFdx(x) + dFdy(x) + fwidth(x));`;

const nestedHelpers = `import { defineShaderFunction } from "shdr";
import type { Expr, F32, Vec2, Vec3, Vec4 } from "shdr";
import { scalar as baseScalar, vector2 as base2, vector3 as base3, vector4 as base4 } from "./derivatives.shdr.ts";
export const scalar = defineShaderFunction((x: Expr<F32>) => baseScalar(x));
export const vector2 = defineShaderFunction((x: Expr<Vec2<F32>>) => base2(x));
export const vector3 = defineShaderFunction((x: Expr<Vec3<F32>>) => base3(x));
export const vector4 = defineShaderFunction((x: Expr<Vec4<F32>>) => base4(x));`;

const entry = `import { createFragmentShader, vec4 } from "shdr";
import { scalar, vector2, vector3, vector4 } from "./nested.shdr.ts";
export default createFragmentShader(({ coord }) => {
  const x = scalar(coord.x);
  const xy = vector2(coord.xy);
  const xyz = vector3(coord.xyz);
  const xyzw = vector4(coord);
  return vec4(x + xy.x + xyz.x, xy.y, xyz.z, xyzw.w);
});`;

function graph(files: Record<string, string> = {}): ShaderVirtualGraphInput {
  return {
    entry: "/work/scene.shdr.ts",
    files: {
      "/work/scene.shdr.ts": entry,
      "/work/nested.shdr.ts": nestedHelpers,
      "/work/derivatives.shdr.ts": derivativeHelpers,
      ...files,
    },
  };
}

function expectDiagnostic(
  result: ReturnType<typeof compileFragmentArtifact>,
  fileName: string,
  source: string,
  token: string,
  code?: ShaderDiagnosticCode,
  occurrence: "first" | "last" = "first",
): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result).not.toHaveProperty("artifact");
  const diagnostic = result.diagnostics.find((item) => "fileName" in item && item.fileName === fileName);
  expect(diagnostic, JSON.stringify(result.diagnostics)).toBeDefined();
  expect(diagnostic?.range).toEqual({ start: occurrence === "last" ? source.lastIndexOf(token) : source.indexOf(token), length: token.length });
  if (code) expect(diagnostic?.code).toBe(code);
}

describe("fragment derivatives in reusable helper graphs", () => {
  it("preserves local, imported and nested helper derivatives on both backends", () => {
    const result = compileFragmentArtifact(graph());
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.glsl.match(/shdr_internal_fn_\d+\(/g)).toHaveLength(16);
    expect(result.artifact.wgsl.match(/fn shdr_internal_fn_\d+\(/g)).toHaveLength(8);
    expect(result.artifact.glsl).toContain("-(dFdy(");
    expect(result.artifact.wgsl).toContain("dpdx(");
    expect(result.artifact.wgsl).toContain("dpdy(");
    expect(result.artifact.wgsl).toContain("fwidth(");
  });

  it.each([
    ["wrong arity", derivativeHelpers.replace("dFdx(x)", "dFdx(x, x)"), "dFdx(x, x)", ShaderDiagnosticCode.InvalidBuiltin],
    ["unsupported matrix", derivativeHelpers.replace("Expr<F32>", "Expr<Mat2<F32>>").replace("dFdx(x) + dFdy(x) + fwidth(x)", "dFdx(x)"), "dFdx(x)", ShaderDiagnosticCode.InvalidBuiltin],
    ["forbidden capture", derivativeHelpers.replace("export const scalar =", "import { uniforms } from \"./schema.shdr.ts\";\nexport const scalar =").replace("dFdx(x) + dFdy(x) + fwidth(x)", "dFdx(x) + uniforms.gain"), "uniforms", ShaderDiagnosticCode.ClosureCapture],
    ["unsupported control flow", derivativeHelpers.replace("dFdx(x) + dFdy(x) + fwidth(x)", "x > 0 ? dFdx(x) : dFdy(x)"), "x > 0 ? dFdx(x) : dFdy(x)", undefined],
  ] as const)("attributes %s errors to the helper and emits no artifact", (_label, helper, token, code) => {
    const files: Record<string, string> = { "/work/derivatives.shdr.ts": helper };
    if (helper.includes("./schema.shdr.ts")) files["/work/schema.shdr.ts"] = `import { defineUniforms } from "shdr"; export const uniforms = defineUniforms((u) => ({ gain: u.f32(1) }));`;
    const result = compileFragmentArtifact(graph(files));
    expectDiagnostic(result, "/work/derivatives.shdr.ts", helper, token, code, _label === "forbidden capture" ? "last" : "first");
  });

  it("invalidates helper acceptance on edit and recovers after restoration", () => {
    const valid = graph();
    const invalidHelper = derivativeHelpers.replace("dFdx(x)", "dFdx(x, x)");
    const invalid = graph({ "/work/derivatives.shdr.ts": invalidHelper });
    const first = compileFragmentArtifact(valid);
    expect(first.ok).toBe(true);
    const rejected = compileFragmentArtifact(invalid);
    expectDiagnostic(rejected, "/work/derivatives.shdr.ts", invalidHelper, "dFdx(x, x)", ShaderDiagnosticCode.InvalidBuiltin);
    const restored = compileFragmentArtifact(valid);
    expect(restored).toEqual(first);
  });

  it("keeps artifact schema, uniform/texture metadata and bindings unchanged", () => {
    const schema = `import { defineUniforms } from "shdr"; export const uniforms = defineUniforms((u) => ({ gain: u.f32(0.5), photo: u.texture2D("/photo.png") }));`;
    const helper = `import { defineShaderFunction, dFdx } from "shdr"; import type { Expr, F32 } from "shdr"; export const adjust = defineShaderFunction((x: Expr<F32>) => x * 0.0);`;
    const scene = `import { createFragmentShader, sample, vec4 } from "shdr"; import { uniforms } from "./schema.shdr.ts"; import { adjust } from "./adjust.shdr.ts"; export default createFragmentShader(({ coord, uniforms }) => { const c = sample(uniforms.photo, coord.xy / uniforms.resolution); return vec4(c.x + adjust(coord.x), c.y, c.z, c.w); }, { uniforms });`;
    const make = (adjustSource: string) => compileFragmentArtifact({
      entry: "/work/scene.shdr.ts",
      files: { "/work/scene.shdr.ts": scene, "/work/schema.shdr.ts": schema, "/work/adjust.shdr.ts": adjustSource },
    });
    const baseline = make(helper);
    const derivative = make(helper.replace("x * 0.0", "dFdx(x)"));
    expect(baseline.ok).toBe(true);
    expect(derivative.ok).toBe(true);
    if (!baseline.ok || !derivative.ok) return;
    expect(Object.keys(derivative.artifact)).toEqual(Object.keys(baseline.artifact));
    expect({ ...derivative.artifact, glsl: "", wgsl: "" }).toEqual({ ...baseline.artifact, glsl: "", wgsl: "" });
    expect(derivative.artifact).toMatchObject({
      defaults: baseline.artifact.defaults,
      custom: baseline.artifact.custom,
      resources: baseline.artifact.resources,
    });
    expect(JSON.parse(JSON.stringify(derivative.artifact))).toEqual(derivative.artifact);
    expect(derivative.artifact.glsl).not.toBe(baseline.artifact.glsl);
    expect(derivative.artifact.wgsl).not.toBe(baseline.artifact.wgsl);
  });
});
