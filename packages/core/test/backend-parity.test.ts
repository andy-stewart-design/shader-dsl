import { describe, expect, it } from "vitest";

import { generateGlslFragment } from "../src/generate-glsl-fragment.js";
import { generateWgslFragment } from "../src/generate-wgsl-fragment.js";
import {
  lowerFragment,
  type ShaderExpression,
  type ShaderModule,
} from "../src/index.js";
import { readShaderFixture } from "./read-shader-fixture.js";

describe("backend parity at the typed IR boundary", () => {
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

    expect(wgslFirst).toContain(
      "@builtin(position) shdr_coord: vec4<f32>",
    );
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
      case "local-reference":
        return;
      case "swizzle":
        visit(expression.expression);
        return;
      case "binary":
        visit(expression.left);
        visit(expression.right);
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
  return (
    Object.isFrozen(value) && Object.values(value).every(isDeepFrozen)
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled IR value: ${JSON.stringify(value)}`);
}
