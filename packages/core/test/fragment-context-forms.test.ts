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
