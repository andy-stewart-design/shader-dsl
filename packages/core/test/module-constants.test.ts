import { describe, expect, it } from "vitest";

import {
  parseModuleConstants,
  ShaderDiagnosticCode,
  type ModuleConstantReference,
} from "../src/index.js";

function reference(
  source: string,
  name: string,
  from = 0,
): ModuleConstantReference {
  const start =
    from === 0 ? source.lastIndexOf(name) : source.indexOf(name, from);
  expect(start).toBeGreaterThanOrEqual(0);
  return { name, range: { start, length: name.length } };
}

function diagnosticText(
  source: string,
  range: { start: number; length: number },
): string {
  return source.slice(range.start, range.start + range.length);
}

describe("parseModuleConstants", () => {
  it("classifies finite literals, earlier aliases, and supported vector shapes", () => {
    const source = `import { vec2, vec3, vec4 } from "shdr";
const RADIUS = 0.1;
const NEGATIVE = -0.2;
const CENTER = vec2(0, RADIUS);
const TINT = vec3(CENTER, NEGATIVE);
const COPY = TINT;
const COLOR = vec4(CENTER, RADIUS, NEGATIVE);
const USED_COLOR = COLOR;
const USED_COPY = COPY;
`;
    const result = parseModuleConstants(source, [
      reference(source, "COLOR"),
      reference(source, "COPY"),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.constants.keys()].sort()).toEqual(
      ["COLOR", "COPY", "CENTER", "RADIUS", "NEGATIVE", "TINT"].sort(),
    );
    expect(result.constants.get("RADIUS")?.type).toEqual({
      kind: "scalar",
      scalar: "f32",
    });
    expect(result.constants.get("CENTER")?.type).toEqual({
      kind: "vector",
      scalar: "f32",
      size: 2,
    });
    expect(result.constants.get("TINT")?.type).toEqual({
      kind: "vector",
      scalar: "f32",
      size: 3,
    });
    expect(result.constants.get("COLOR")?.type).toEqual({
      kind: "vector",
      scalar: "f32",
      size: 4,
    });
    expect(result.constants.get("NEGATIVE")?.initializer).toMatchObject({
      kind: "literal",
      value: -0.2,
    });
  });

  it("analyzes only referenced declarations and leaves unused host code inert", () => {
    const source = `import { vec2 } from "shdr";
const UNUSED_CALL = computeColor();
const UNUSED_ARITHMETIC = 1 + 2;
const VALUE = 0.25;
const POINT = vec2(VALUE, 0);
const USED_POINT = POINT;
const USED_CALL = UNUSED_CALL;
`;
    const result = parseModuleConstants(source, [reference(source, "POINT")]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.constants.keys()]).toEqual(["POINT", "VALUE"]);

    const invalid = parseModuleConstants(source, [
      reference(source, "UNUSED_CALL"),
    ]);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.diagnostics[0]).toMatchObject({
      code: ShaderDiagnosticCode.UnsupportedCall,
    });
    expect(diagnosticText(source, invalid.diagnostics[0]!.range)).toBe(
      "computeColor()",
    );
  });

  it.each([
    {
      name: "forward reference",
      source: `const FIRST = SECOND;
const SECOND = 0.1;
const USED = FIRST;
`,
      requested: "FIRST",
      code: ShaderDiagnosticCode.ForwardReference,
      rangeText: "SECOND",
    },
    {
      name: "self reference",
      source: "const SELF = SELF;\nconst USED = SELF;\n",
      requested: "SELF",
      code: ShaderDiagnosticCode.ForwardReference,
      rangeText: "SELF",
    },
    {
      name: "initializer arithmetic",
      source: "const VALUE = 1 + 2;\nconst USED = VALUE;\n",
      requested: "VALUE",
      code: ShaderDiagnosticCode.UnsupportedOperator,
      rangeText: "1 + 2",
    },
    {
      name: "wrong vector shape",
      source: `import { vec2, vec3 } from "shdr";
const POINT = vec2(0, 0);
const BAD = vec3(POINT, POINT);
const USED = BAD;
`,
      requested: "BAD",
      code: ShaderDiagnosticCode.InvalidConstructor,
      rangeText: "vec3(POINT, POINT)",
    },
    {
      name: "f32 overflow",
      source: "const TOO_LARGE = 1e40;\nconst USED = TOO_LARGE;\n",
      requested: "TOO_LARGE",
      code: ShaderDiagnosticCode.InvalidNumericLiteral,
      rangeText: "1e40",
    },
    {
      name: "imported value",
      source: `import { external } from "./other.shdr.ts";
const VALUE = external;
const USED = VALUE;
`,
      requested: "VALUE",
      code: ShaderDiagnosticCode.ClosureCapture,
      rangeText: "external",
    },
    {
      name: "unsafe generated name",
      source: "const coord = 0.1;\nconst USED = coord;\n",
      requested: "coord",
      code: ShaderDiagnosticCode.DuplicateLocal,
      rangeText: "coord",
    },
    {
      name: "multiple declarators",
      source: "const FIRST = 0.1, SECOND = 0.2;\nconst USED = FIRST;\n",
      requested: "FIRST",
      code: ShaderDiagnosticCode.InvalidVariableDeclaration,
      rangeText: "FIRST = 0.1, SECOND = 0.2",
    },
    {
      name: "type annotation",
      source: "const VALUE: number = 0.1;\nconst USED = VALUE;\n",
      requested: "VALUE",
      code: ShaderDiagnosticCode.InvalidVariableDeclaration,
      rangeText: "VALUE: number = 0.1",
    },
  ])(
    "rejects $name at an authored range",
    ({ source, requested, code, rangeText }) => {
      const result = parseModuleConstants(source, [
        reference(source, requested),
      ]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostics[0]).toMatchObject({ code });
      expect(diagnosticText(source, result.diagnostics[0]!.range)).toContain(
        rangeText,
      );
    },
  );

  it("requires directly imported constructors and keeps helper/schema markers inert", () => {
    const withoutImportSource =
      "const POINT = vec2(0, 0);\nconst USED = POINT;\n";
    const withoutImport = parseModuleConstants(withoutImportSource, [
      reference(withoutImportSource, "POINT"),
    ]);
    expect(withoutImport.ok).toBe(false);
    if (!withoutImport.ok)
      expect(withoutImport.diagnostics[0]?.code).toBe(
        ShaderDiagnosticCode.UnsupportedCall,
      );

    const source = `import { defineShaderFunction, defineUniforms } from "shdr";
const helper = defineShaderFunction(() => 0);
const schema = defineUniforms((u) => ({ value: u.f32(0) }));
const USE_HELPER = helper;
const USE_SCHEMA = schema;
`;
    for (const name of ["helper", "schema"]) {
      const result = parseModuleConstants(source, [reference(source, name)]);
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.diagnostics[0]?.code).toBe(
          ShaderDiagnosticCode.DuplicateLocal,
        );
    }
  });

  it("does not make a defining-file constant visible in another source", () => {
    const helper = "const PRIVATE = 0.5;\nconst USED = PRIVATE;\n";
    const local = parseModuleConstants(helper, [reference(helper, "PRIVATE")]);
    expect(local.ok).toBe(true);

    const entry = `import { PRIVATE } from "./helper.shdr.ts";
const VALUE = PRIVATE;
const USED = VALUE;
`;
    const imported = parseModuleConstants(entry, [reference(entry, "PRIVATE")]);
    expect(imported.ok).toBe(false);
    if (!imported.ok)
      expect(imported.diagnostics[0]).toMatchObject({
        code: ShaderDiagnosticCode.ClosureCapture,
        range: reference(entry, "PRIVATE").range,
      });
  });
});
