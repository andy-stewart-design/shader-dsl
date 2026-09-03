import { describe, expect, it } from "vitest";

import {
  lowerShaderSyntax,
  parseShaderFile,
  ShaderDiagnosticCode,
  type LowerShaderSyntaxResult,
  type ShaderCallbackSyntax,
  type ShaderConstDeclaration,
  type ShaderReturnStatement,
} from "../src/index.js";

function lowerSource(body: string): {
  readonly source: string;
  readonly result: LowerShaderSyntaxResult;
} {
  const source = `import { createFragmentShader } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
${body}
});
`;
  const parsed = parseShaderFile(source, "lowering.shdr.ts");
  expect(parsed.diagnostics).toEqual([]);
  expect(parsed.info).toBeDefined();
  return {
    source,
    result: lowerShaderSyntax(parsed.info!.callback.syntax),
  };
}

function textAt(
  source: string,
  range: { readonly start: number; readonly length: number },
): string {
  return source.slice(range.start, range.start + range.length);
}

function expectConst(
  statement: ShaderConstDeclaration | ShaderReturnStatement | undefined,
): ShaderConstDeclaration {
  expect(statement?.kind).toBe("const-declaration");
  if (statement?.kind !== "const-declaration") {
    throw new Error("Expected a lowered const declaration.");
  }
  return statement;
}

describe("shader syntax lowering", () => {
  it("lowers built-ins, uniforms, literals, locals, and the final return", () => {
    const { source, result } = lowerSource(`
  const viewport = uniforms.resolution;
  const pointer = uniforms.mouse;
  const elapsed = uniforms.time;
  const zero = 0;
  const copied = elapsed;
  return coord;`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.module).toMatchObject({
      kind: "shader-module",
      stage: "fragment",
    });
    expect(
      source.slice(
        result.module.range.start,
        result.module.range.start + result.module.range.length,
      ),
    ).toContain("({ coord, uniforms }) =>");
    expect(result.module.statements).toHaveLength(6);

    const viewport = expectConst(result.module.statements[0]);
    const pointer = expectConst(result.module.statements[1]);
    const elapsed = expectConst(result.module.statements[2]);
    const zero = expectConst(result.module.statements[3]);
    const copied = expectConst(result.module.statements[4]);
    const returned = result.module.statements[5];

    expect(viewport).toMatchObject({
      name: "viewport",
      symbolId: 0,
      initializer: {
        kind: "default-uniform",
        uniform: "resolution",
        type: { kind: "vector", scalar: "f32", size: 2 },
      },
    });
    expect(pointer.initializer).toMatchObject({
      kind: "default-uniform",
      uniform: "mouse",
      type: { kind: "vector", scalar: "f32", size: 2 },
    });
    expect(elapsed).toMatchObject({
      symbolId: 2,
      initializer: {
        kind: "default-uniform",
        uniform: "time",
        type: { kind: "scalar", scalar: "f32" },
      },
    });
    expect(zero.initializer).toMatchObject({
      kind: "numeric-literal",
      value: 0,
      type: { kind: "scalar", scalar: "f32" },
    });
    expect(copied).toMatchObject({
      symbolId: 4,
      initializer: {
        kind: "local-reference",
        name: "elapsed",
        symbolId: elapsed.symbolId,
        type: elapsed.initializer.type,
      },
    });
    expect(textAt(source, viewport.initializer.range)).toBe(
      "uniforms.resolution",
    );
    expect(textAt(source, pointer.initializer.range)).toBe("uniforms.mouse");
    expect(textAt(source, elapsed.initializer.range)).toBe("uniforms.time");
    expect(textAt(source, zero.initializer.range)).toBe("0");
    expect(textAt(source, copied.initializer.range)).toBe("elapsed");
    expect(returned).toMatchObject({
      kind: "return-statement",
      expression: {
        kind: "builtin-input",
        input: "fragment-position",
        type: { kind: "vector", scalar: "f32", size: 4 },
      },
    });

    if (returned?.kind !== "return-statement") {
      throw new Error("Expected a lowered return statement.");
    }
    expect(textAt(source, returned.range)).toBe("return coord;");
    expect(textAt(source, returned.expression.range)).toBe("coord");

    const serialized = JSON.stringify(result.module);
    expect(serialized).not.toMatch(
      /gl_FragCoord|u_resolution|#version|@builtin|@location/,
    );
  });

  it("rejects a forward local reference", () => {
    const { source, result } = lowerSource(`
  const first = later;
  const later = 0;
  return coord;`);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.ForwardReference,
          message:
            'Shader local "later" cannot be referenced before its declaration.',
          range: { start: source.indexOf("later"), length: "later".length },
          severity: "error",
        },
      ],
    });
  });

  it("rejects a duplicate local declaration", () => {
    const syntax: ShaderCallbackSyntax = {
      range: { start: 0, length: 50 },
      declarations: [
        {
          name: "value",
          nameRange: { start: 6, length: 5 },
          range: { start: 0, length: 16 },
          initializer: {
            kind: "numeric-literal",
            value: 0,
            range: { start: 14, length: 1 },
          },
        },
        {
          name: "value",
          nameRange: { start: 22, length: 5 },
          range: { start: 16, length: 16 },
          initializer: {
            kind: "numeric-literal",
            value: 1,
            range: { start: 30, length: 1 },
          },
        },
      ],
      returnRange: { start: 33, length: 13 },
      returnExpression: {
        kind: "identifier",
        name: "coord",
        range: { start: 40, length: 5 },
      },
    };

    expect(lowerShaderSyntax(syntax)).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: ShaderDiagnosticCode.DuplicateLocal,
          range: { start: 22, length: 5 },
        }),
      ],
    });
  });

  it("rejects an invalid default uniform name", () => {
    const { source, result } = lowerSource(`
  const invalid = uniforms.viewport;
  return coord;`);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidUniform,
          message: 'Unknown default uniform "viewport".',
          range: {
            start: source.indexOf(".viewport") + 1,
            length: "viewport".length,
          },
          severity: "error",
        },
      ],
    });
  });

  it("rejects an unknown identifier independently of parser AST types", () => {
    const syntax: ShaderCallbackSyntax = {
      range: { start: 0, length: 30 },
      declarations: [],
      returnRange: { start: 7, length: 20 },
      returnExpression: {
        kind: "identifier",
        name: "outsideValue",
        range: { start: 14, length: 12 },
      },
    };

    expect(lowerShaderSyntax(syntax)).toEqual({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.UnknownIdentifier,
          message:
            'Unknown shader identifier "outsideValue"; shader callbacks cannot capture outer values.',
          range: { start: 14, length: 12 },
          severity: "error",
        },
      ],
    });
  });
});
