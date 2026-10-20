import { describe, expect, it } from "vitest";
import { compileFragmentArtifact } from "../src/compile-fragment-artifact.js";
import { createVirtualSource } from "../src/create-virtual-source.js";
import { ShaderDiagnosticCode } from "../src/diagnostics.js";

const imports = 'import { createFragmentShader, vec4 } from "shdr";\n';
function compile(callback: string) {
  const source = `${imports}export default createFragmentShader(${callback});`;
  const virtual = createVirtualSource(source);
  expect(virtual.ok, JSON.stringify(virtual.diagnostics)).toBe(true);
  const result = compileFragmentArtifact(source);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error("Expected dual-target artifact");
  return result.artifact;
}

describe("fragment callback context forms", () => {
  it("accepts empty callbacks without implicit context bindings", () => {
    const artifact = compile("() => vec4(0.25)");
    expect(artifact).toEqual(compile("({ uniforms }) => vec4(0.25)"));
    expect(artifact).toEqual(compile("({}) => vec4(0.25)"));
    expect(artifact.defaults).toEqual({ glsl: [], wgsl: [] });
    const invalid = `${imports}export default createFragmentShader(() => vec4(coord.x));`;
    const result = compileFragmentArtifact(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe(
        ShaderDiagnosticCode.ClosureCapture,
      );
      expect(
        invalid.slice(
          result.diagnostics[0]!.range.start,
          result.diagnostics[0]!.range.start +
            result.diagnostics[0]!.range.length,
        ),
      ).toBe("coord");
    }
  });

  it("resolves a named context's coord, automatic and custom uniforms", () => {
    const canonical = compile(
      "({ coord, uniforms }) => vec4(coord.x / uniforms.resolution.x, uniforms.time, 0, 1)",
    );
    const named = compile(
      "(ctx) => vec4(ctx.coord.x / ctx.uniforms.resolution.x, ctx.uniforms.time, 0, 1)",
    );
    const reordered = compile(
      "({ uniforms, coord }) => vec4(coord.x / uniforms.resolution.x, uniforms.time, 0, 1)",
    );
    expect(named).toEqual(canonical);
    expect(reordered).toEqual(canonical);
    const source = `import { createFragmentShader, defineUniforms, vec4 } from "shdr";
const uniforms = defineUniforms((u) => ({ gain: u.f32(0.5) }));
export default createFragmentShader((ctx) => vec4(ctx.uniforms.gain, ctx.coord.y, 0, 1), { uniforms });`;
    const result = compileFragmentArtifact(source);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (result.ok) {
      expect(result.artifact.custom?.declarations).toMatchObject([
        { name: "gain", default: 0.5 },
      ]);
      expect(result.artifact.custom?.referenced).toEqual({
        glsl: ["gain"],
        wgsl: ["gain"],
      });
    }
  });

  it("treats u and uniforms as one namespace across context forms and local aliases", () => {
    const canonical = compile(
      "({ coord, uniforms }) => vec4(coord.x / uniforms.resolution.x, uniforms.time, 0, 1)",
    );
    for (const callback of [
      "($) => vec4($.coord.x / $.u.resolution.x, $.u.time, 0, 1)",
      "({ u, coord }) => vec4(coord.x / u.resolution.x, u.time, 0, 1)",
      "({ coord, uniforms, u }) => vec4(coord.x / u.resolution.x, uniforms.time, 0, 1)",
      "({ u, coord, uniforms }) => vec4(coord.x / uniforms.resolution.x, u.time, 0, 1)",
      "({ uniforms, u, coord }) => vec4(coord.x / u.resolution.x, uniforms.time, 0, 1)",
      "({ coord, u, uniforms }) => vec4(coord.x / uniforms.resolution.x, u.time, 0, 1)",
      "({ u, uniforms, coord }) => vec4(coord.x / uniforms.resolution.x, u.time, 0, 1)",
      "($) => { const u = $.u; const another = u; return vec4($.coord.x / another.resolution.x, u.time, 0, 1); }",
      "({ uniforms, coord }) => { const another = uniforms; return vec4(coord.x / another.resolution.x, uniforms.time, 0, 1); }",
      "($) => { const other = $.uniforms; return vec4($.coord.x / other.resolution.x, other.time, 0, 1); }",
    ]) {
      expect(compile(callback), callback).toEqual(canonical);
    }

    const source = `import { createFragmentShader, defineUniforms, vec2, vec4, sample } from "shdr";
const uniforms = defineUniforms((u) => ({ gain: u.f32(0.5), photo: u.texture2D("/photo.png") }));
export default createFragmentShader(({ coord, uniforms, u }) =>
  vec4(uniforms.gain, u.gain, sample(u.photo, vec2(coord.x, 0)).r, 1), { uniforms });`;
    const result = compileFragmentArtifact(source);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (result.ok) {
      expect(result.artifact.custom?.declarations).toMatchObject([
        { name: "gain", default: 0.5 },
      ]);
      expect(result.artifact.resources?.textures).toMatchObject([
        { name: "photo", url: "/photo.png" },
      ]);
      expect(result.artifact.custom?.referenced.glsl).toEqual(["gain"]);
      expect(result.artifact.resources?.referenced?.glsl).toEqual(["photo"]);
    }
  });

  it("rejects namespace values, unknown members, duplicate names and forward aliases", () => {
    for (const [callback, code, token] of [
      ["($) => vec4($.u)", ShaderDiagnosticCode.InvalidUniform, "$.u"],
      ["({ u }) => vec4(u)", ShaderDiagnosticCode.InvalidUniform, "u"],
      [
        "($) => { const alias = $.u; return vec4(alias); }",
        ShaderDiagnosticCode.InvalidUniform,
        "alias",
      ],
      [
        "($) => vec4($.u.missing)",
        ShaderDiagnosticCode.InvalidUniform,
        "missing",
      ],
      [
        "({ u }) => { const u = vec4(1); return u; }",
        ShaderDiagnosticCode.TypeScriptSyntax,
        "u",
      ],
      [
        "($) => { const other = u; const u = $.u; return vec4(1); }",
        ShaderDiagnosticCode.ForwardReference,
        "u",
      ],
    ] as const) {
      const source = `${imports}export default createFragmentShader(${callback});`;
      const result = compileFragmentArtifact(source);
      expect(result.ok, callback).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostics[0]?.code, callback).toBe(code);
      const range = result.diagnostics[0]!.range;
      expect(source.slice(range.start, range.start + range.length)).toBe(token);
    }
  });

  it("accepts coord-only and uniforms-only destructuring", () => {
    const coordOnly = compile("({ coord }) => vec4(coord.x, 0, 0, 1)");
    expect(coordOnly).toEqual(
      compile("({ coord, uniforms }) => vec4(coord.x, 0, 0, 1)"),
    );
    expect(coordOnly.defaults).toEqual({ glsl: ["resolution"], wgsl: [] });
    const uniformsOnly = compile("({ uniforms }) => vec4(uniforms.time)");
    expect(uniformsOnly).toEqual(
      compile("({ coord, uniforms }) => vec4(uniforms.time)"),
    );
    expect(uniformsOnly.defaults).toEqual({ glsl: ["time"], wgsl: ["time"] });
  });

  it("rejects unknown context members, captures, and unsupported callback signatures at authored ranges", () => {
    for (const [callback, code, token] of [
      [
        "(ctx) => vec4(ctx.mouse)",
        ShaderDiagnosticCode.UnsupportedPropertyAccess,
        "ctx.mouse",
      ],
      [
        "(ctx) => vec4(ctx.uniforms.invalid)",
        ShaderDiagnosticCode.InvalidUniform,
        "invalid",
      ],
      ["(ctx) => vec4(coord.x)", ShaderDiagnosticCode.ClosureCapture, "coord"],
      [
        "(vec4) => vec4(1)",
        ShaderDiagnosticCode.InvalidCallbackParameter,
        "vec4",
      ],
      [
        "({ mouse }) => vec4(1)",
        ShaderDiagnosticCode.InvalidCallbackParameter,
        "{ mouse }",
      ],
      ["(a, b) => vec4(1)", ShaderDiagnosticCode.InvalidCallbackParameter, "a"],
      [
        "(ctx: number) => vec4(1)",
        ShaderDiagnosticCode.InvalidCallbackParameter,
        "ctx: number",
      ],
    ] as const) {
      const source = `${imports}export default createFragmentShader(${callback});`;
      const result = compileFragmentArtifact(source);
      expect(result.ok, callback).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostics[0]?.code).toBe(code);
      const range = result.diagnostics[0]!.range;
      expect(source.slice(range.start, range.start + range.length)).toBe(token);
    }
  });
});
