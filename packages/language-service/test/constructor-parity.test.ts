import {
  createVirtualSource,
  lowerShaderSyntax,
  parseShaderFile,
  ShaderDiagnosticCode,
  type ShaderConstDeclaration,
} from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TypeScript7CheckerAdapter } from "../src/index.js";

const projectDirectory = fileURLToPath(
  new URL("fixtures/project/", import.meta.url),
);

interface ConstructorCase {
  readonly name: string;
  readonly call: string;
  readonly valid: boolean;
}

const constructorMatrix: readonly ConstructorCase[] = [
  {
    name: "four scalars",
    call: "vec4(uniforms.time, uniforms.time, 0, 1)",
    valid: true,
  },
  {
    name: "Vec2 followed by two scalars",
    call: "vec4(uniforms.resolution, 0, 1)",
    valid: true,
  },
  {
    name: "scalar splat",
    call: "vec4(uniforms.time)",
    valid: true,
  },
  {
    name: "Vec4 copy",
    call: "vec4(coord)",
    valid: true,
  },
  {
    name: "single Vec2",
    call: "vec4(uniforms.resolution)",
    valid: false,
  },
  {
    name: "three scalars",
    call: "vec4(uniforms.time, 0, 1)",
    valid: false,
  },
  {
    name: "vector in a scalar position",
    call: "vec4(uniforms.time, uniforms.resolution, 0, 1)",
    valid: false,
  },
  {
    name: "Vec4 followed by two scalars",
    call: "vec4(coord, 0, 1)",
    valid: false,
  },
];

describe("vec4 constructor parity", () => {
  it("keeps TypeScript overloads and semantic rules in agreement", () => {
    const adapter = new TypeScript7CheckerAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });

    try {
      for (const [index, testCase] of constructorMatrix.entries()) {
        const fileName = join(
          projectDirectory,
          `constructor-parity-${index}.shdr.ts`,
        );
        const source = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const result = ${testCase.call};
  return coord;
});
`;
        const parsed = parseShaderFile(source, fileName);
        expect(parsed.diagnostics, testCase.name).toEqual([]);
        if (!parsed.info) continue;

        const semantic = lowerShaderSyntax(parsed.info.callback.syntax);
        const virtual = createVirtualSource(source, fileName);
        expect(virtual.ok, testCase.name).toBe(true);
        if (!virtual.ok) continue;

        const checked = adapter.checkVirtualSource(
          fileName,
          virtual.virtualSource,
        );
        try {
          if (testCase.valid) {
            expect(semantic.ok, testCase.name).toBe(true);
            expect(checked.semanticDiagnostics, testCase.name).toEqual([]);
            expect(
              checked.getTypeOfNamedDeclaration("result")?.display,
              testCase.name,
            ).toBe("Expr<Vec4<F32>>");
            if (!semantic.ok) continue;

            const declaration = semantic.module.statements[0] as
              ShaderConstDeclaration | undefined;
            expect(declaration?.initializer, testCase.name).toMatchObject({
              kind: "call",
              target: { kind: "constructor", name: "vec4" },
              type: { kind: "vector", scalar: "f32", size: 4 },
            });
          } else {
            expect(semantic.ok, testCase.name).toBe(false);
            expect(
              checked.semanticDiagnostics.length,
              testCase.name,
            ).toBeGreaterThan(0);
            if (semantic.ok) continue;
            expect(semantic.diagnostics, testCase.name).toEqual([
              expect.objectContaining({
                code: ShaderDiagnosticCode.InvalidConstructor,
                range: {
                  start: source.indexOf(testCase.call),
                  length: testCase.call.length,
                },
              }),
            ]);
          }
        } finally {
          checked.dispose();
        }
      }
    } finally {
      adapter.dispose();
    }
  });
});
