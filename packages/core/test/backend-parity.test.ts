import { describe, expect, it } from "vitest";

import { generateGlslFragment } from "../src/generate-glsl-fragment.js";
import { generateWgslFragment } from "../src/generate-wgsl-fragment.js";
import { compileFragmentArtifact } from "../src/compile-fragment-artifact.js";
import {
  lowerFragment,
  type ShaderExpression,
  type ShaderModule,
} from "../src/index.js";
import { readShaderFixture } from "./read-shader-fixture.js";

describe("backend parity at the typed IR boundary", () => {
  it("retains fallback output for generated-name collisions, keywords, and Unicode", () => {
    const names = [
      "shdr_coord",
      "shdr_fragment_color",
      "shdr_local_0",
      "shdr_custom_0",
      "shdr_time",
      "$color",
      "café",
      "attribute",
    ];
    const artifacts = names.map((name) => {
      const source = `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const ${name} = 0.25;
  return vec4(${name});
});`;
      const lowered = lowerFragment(source);
      expect(lowered.ok, name).toBe(true);
      if (!lowered.ok) throw new Error(`Unable to lower ${name}`);
      expect(lowered.ir.statements[0]).toMatchObject({
        kind: "const-declaration",
        name,
        symbolId: 0,
      });
      const compiled = compileFragmentArtifact(source);
      expect(compiled.ok, name).toBe(true);
      if (!compiled.ok) throw new Error(`Unable to compile ${name}`);
      return compiled.artifact;
    });
    for (const artifact of artifacts) expect(artifact).toEqual(artifacts[0]);
    expect(artifacts[0]?.glsl).toContain("float shdr_local_0 = 0.25;");
    expect(artifacts[0]?.glsl).toContain("vec4(shdr_local_0)");
    expect(artifacts[0]?.wgsl).toContain("let shdr_local_0: f32 = 0.25f;");
    expect(artifacts[0]?.wgsl).toContain("vec4<f32>(shdr_local_0)");
  });

  it("uses authored names for safe locals, changing output on safe alpha-renaming", () => {
    const compile = (name: string) => {
      const source = `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ uniforms }) => {
  const ${name} = uniforms.time;
  return vec4(${name}, 0, 0, 1);
});`;
      const compiled = compileFragmentArtifact(source);
      expect(compiled.ok, name).toBe(true);
      if (!compiled.ok) throw new Error(`Cannot compile ${name}`);
      return compiled.artifact;
    };
    const first = compile("gain");
    const renamed = compile("intensity");
    expect(first.glsl).toContain("float gain = u_time;");
    expect(first.wgsl).toContain("let gain: f32 = shdr_time;");
    expect(renamed.glsl).toContain("float intensity = u_time;");
    expect(renamed.wgsl).toContain("let intensity: f32 = shdr_time;");
    expect(first.glsl).not.toEqual(renamed.glsl);
    expect(first.wgsl).not.toEqual(renamed.wgsl);
    const { glsl: _firstGlsl, wgsl: _firstWgsl, ...firstMetadata } = first;
    const {
      glsl: _renamedGlsl,
      wgsl: _renamedWgsl,
      ...renamedMetadata
    } = renamed;
    expect(firstMetadata).toEqual(renamedMetadata);
  });

  it("keeps a coord-reading local distinct from the generated fragment-position binding", () => {
    const source = `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const shdr_coord = coord;
  return vec4(shdr_coord.x / uniforms.resolution.x, 0, 0, 1);
});`;
    const compiled = compileFragmentArtifact(source);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.artifact.glsl).toContain("vec4 shdr_local_0 = shdr_coord;");
    expect(compiled.artifact.wgsl).toContain(
      "let shdr_local_0: vec4<f32> = shdr_coord;",
    );
    expect(compiled.artifact.glsl).toContain("shdr_local_0.x");
    expect(compiled.artifact.wgsl).toContain("shdr_local_0.x");
  });

  it("makes literal-only arithmetic f32 before WGSL evaluates it", () => {
    const source = `import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  return vec4(16777217 - 16777216, 0, 0, 1);
});`;
    const compiled = compileFragmentArtifact(source);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.artifact.wgsl).toContain("16777217.0f - 16777216.0f");
    expect(compiled.artifact.glsl).toContain("16777217.0 - 16777216.0");
  });

  it("generates both targets repeatedly from the exact same frozen IR", async () => {
    const source = await readShaderFixture("gradient");
    const lowered = lowerFragment(source);
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;

    const ir = lowered.ir;
    const originalSerialization = JSON.stringify(ir);
    const originalMetadata = expressionMetadata(ir);
    deepFreeze(ir);

    const glslFirst = generateGlslFragment(ir);
    const wgslFirst = generateWgslFragment(ir);
    const wgslSecond = generateWgslFragment(ir);
    const glslSecond = generateGlslFragment(ir);

    expect(glslFirst).toBe(glslSecond);
    expect(wgslFirst).toBe(wgslSecond);
    expect(JSON.stringify(ir)).toBe(originalSerialization);
    expect(expressionMetadata(ir)).toEqual(originalMetadata);
    expect(isDeepFrozen(ir)).toBe(true);

    expect(glslFirst).toContain("u_resolution.y - gl_FragCoord.y");
    expect(glslFirst).not.toMatch(
      /@fragment|@builtin|@location|vec[234]<f32>|var<uniform>/,
    );

    expect(wgslFirst).toContain("@builtin(position) shdr_coord: vec4<f32>");
    expect(wgslFirst).not.toMatch(
      /#version|precision highp|\buniform\s+|\bout\s+vec4|gl_FragCoord/,
    );

    expect(originalSerialization).toContain('"input":"fragment-position"');
    expect(originalSerialization).not.toMatch(
      /gl_FragCoord|shdr_coord|u_resolution|shdr_resolution|@builtin|#version/,
    );
  });
});

interface ExpressionMetadata {
  readonly kind: ShaderExpression["kind"];
  readonly range: { readonly start: number; readonly length: number };
  readonly type: ShaderExpression["type"];
}

function expressionMetadata(
  module: ShaderModule,
): readonly ExpressionMetadata[] {
  const metadata: ExpressionMetadata[] = [];

  const visit = (expression: ShaderExpression): void => {
    metadata.push({
      kind: expression.kind,
      range: { ...expression.range },
      type: { ...expression.type },
    });

    switch (expression.kind) {
      case "numeric-literal":
      case "builtin-input":
      case "default-uniform":
      case "custom-uniform":
      case "local-reference":
        return;
      case "swizzle":
        visit(expression.expression);
        return;
      case "binary":
        visit(expression.left);
        visit(expression.right);
        return;
      case "unary":
        visit(expression.argument);
        return;
      case "call":
        for (const argument of expression.arguments) visit(argument);
        return;
      default:
        return assertNever(expression);
    }
  };

  for (const statement of module.statements) {
    switch (statement.kind) {
      case "const-declaration":
        visit(statement.initializer);
        break;
      case "return-statement":
        visit(statement.expression);
        break;
      default:
        assertNever(statement);
    }
  }

  return metadata;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled IR value: ${JSON.stringify(value)}`);
}
