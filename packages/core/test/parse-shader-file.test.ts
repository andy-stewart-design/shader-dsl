import { describe, expect, it } from "vitest";

import {
  parseShaderFile,
  ShaderDiagnosticCode,
  type TextRange,
} from "../src/index.js";
import { readShaderFixture } from "./read-shader-fixture.js";

function textAt(source: string, range: TextRange): string {
  return source.slice(range.start, range.start + range.length);
}

describe("parseShaderFile", () => {
  it("recognizes the strict fragment shader boundary", async () => {
    const source = await readShaderFixture("gradient");
    const result = parseShaderFile(source, "gradient.shdr.ts");

    expect(result.diagnostics).toEqual([]);
    expect(result.info).toBeDefined();

    const info = result.info!;

    expect(info.fileName).toBe("gradient.shdr.ts");
    expect(info.createFragmentShaderImport).toMatchObject({
      importedName: "createFragmentShader",
      localName: "createFragmentShader",
    });
    expect(textAt(source, info.createFragmentShaderImport.range)).toBe(
      "createFragmentShader",
    );
    expect(info.shaderCallableImports).toHaveLength(1);
    expect(info.shaderCallableImports[0]).toMatchObject({
      importedName: "vec4",
      localName: "vec4",
    });
    expect(textAt(source, info.shaderCallableImports[0]!.range)).toBe("vec4");
    expect(textAt(source, info.defaultExportRange)).toMatch(
      /^export default createFragmentShader/,
    );
    expect(textAt(source, info.defaultExportCallRange)).toMatch(
      /^createFragmentShader/,
    );
    expect(textAt(source, info.callback.parameterRange)).toBe(
      "{ coord, uniforms }",
    );
    expect(textAt(source, info.callback.bodyRange)).toMatch(/^\{/);
    expect(textAt(source, info.callback.range)).toMatch(
      /^\(\{ coord, uniforms \}\) =>/,
    );
    expect(info.shaderRegion).toEqual(info.callback.range);
  });

  it.each([
    {
      fixture: "boundary/wrong-module",
      code: ShaderDiagnosticCode.WrongModule,
      rangeText: '"other-shdr"',
    },
    {
      fixture: "boundary/aliased-import",
      code: ShaderDiagnosticCode.ImportAlias,
      rangeText: "createFragmentShader as createShader",
    },
    {
      fixture: "boundary/namespace-import",
      code: ShaderDiagnosticCode.NamespaceImport,
      rangeText: "* as shdr",
    },
    {
      fixture: "boundary/missing-default-export",
      code: ShaderDiagnosticCode.MissingDefaultExport,
      rangeText: "createFragmentShader",
    },
    {
      fixture: "boundary/multiple-shader-calls",
      code: ShaderDiagnosticCode.MultipleShaderCalls,
      rangeText: "createFragmentShader",
    },
    {
      fixture: "boundary/async-callback",
      code: ShaderDiagnosticCode.AsyncCallback,
      rangeText: "async",
    },
    {
      fixture: "boundary/wrong-parameter",
      code: ShaderDiagnosticCode.InvalidCallbackParameter,
      rangeText: "{ coord }",
    },
    {
      fixture: "boundary/reserved-identifier",
      code: ShaderDiagnosticCode.ReservedIdentifier,
      rangeText: "__shdr_internal_value",
    },
  ])(
    "returns a ranged $code diagnostic for $fixture",
    async ({ fixture, code, rangeText }) => {
      const source = await readShaderFixture(fixture);
      const result = parseShaderFile(source, `${fixture}.shdr.ts`);

      expect(result.info).toBeUndefined();
      expect(result.diagnostics).toHaveLength(1);

      const diagnostic = result.diagnostics[0]!;
      const diagnosticText = textAt(source, diagnostic.range);

      expect(diagnostic.code).toBe(code);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.range.start).toBeGreaterThanOrEqual(0);
      expect(
        diagnostic.range.start + diagnostic.range.length,
      ).toBeLessThanOrEqual(source.length);
      expect(diagnosticText).toContain(rangeText);
    },
  );

  it("returns TypeScript syntax diagnostics instead of throwing", () => {
    const source = `
      import { createFragmentShader } from "shdr";
      export default createFragmentShader(({ coord, uniforms }) => {
    `;

    expect(() => parseShaderFile(source)).not.toThrow();

    const result = parseShaderFile(source);
    expect(result.info).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe(
      ShaderDiagnosticCode.TypeScriptSyntax,
    );
  });
});
