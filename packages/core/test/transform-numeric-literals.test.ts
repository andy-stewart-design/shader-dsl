import { describe, expect, it } from "vitest";

import {
  mapGeneratedRangeToOriginal,
  mapOriginalOffsetToGenerated,
  parseShaderFile,
  transformShaderExpressions,
  type TextRange,
} from "../src/index.js";

const helperName = "__shdr_internal_f32";
const helperImport = `import { ${helperName} } from "shdr/internal";\n`;

function numericRanges(source: string): TextRange[] {
  return Array.from(source.matchAll(/\b\d+(?:\.\d+)?\b/g), (match) => ({
    start: match.index,
    length: match[0].length,
  }));
}

describe("numeric literal transformation", () => {
  it("wraps only callback literals and preserves explicit parentheses", () => {
    const source = `import { createFragmentShader, vec4 } from "shdr";
const outside = 42;

export default createFragmentShader(({ coord, uniforms }) => {
  const first = (1);
  const second = 2;
  return vec4((0.5), first, second, 0);
});
`;
    const expected = `${helperImport}import { createFragmentShader, vec4 } from "shdr";
const outside = 42;

export default createFragmentShader(({ coord, uniforms }) => {
  const first = (${helperName}(1));
  const second = ${helperName}(2);
  return vec4((${helperName}(0.5)), first, second, ${helperName}(0));
});
`;

    const parsed = parseShaderFile(source, "numeric-literals.shdr.ts");
    expect(parsed.diagnostics).toEqual([]);

    const virtualSource = transformShaderExpressions(source, parsed.info!);

    expect(virtualSource.code).toBe(expected);
    expect(virtualSource.shaderRegion).toEqual(parsed.info!.shaderRegion);
    expect(virtualSource.code).toContain("const outside = 42;");
    expect(virtualSource.code).not.toContain(`${helperName}(42)`);
  });

  it("maps every generated literal wrapper to its original literal", () => {
    const source = `import { createFragmentShader, vec4 } from "shdr";
const outside = 42;

export default createFragmentShader(({ coord, uniforms }) => {
  const first = (1);
  const second = 2;
  return vec4((0.5), first, second, 0);
});
`;
    const parsed = parseShaderFile(source, "numeric-mappings.shdr.ts");
    const virtualSource = transformShaderExpressions(source, parsed.info!);
    const [outside, ...shaderLiterals] = numericRanges(source);
    const generatedHelperStarts = Array.from(
      virtualSource.code.matchAll(new RegExp(`${helperName}\\(`, "g")),
      (match) => match.index,
    );

    expect(shaderLiterals).toHaveLength(4);
    expect(generatedHelperStarts).toHaveLength(4);

    for (const [index, original] of shaderLiterals.entries()) {
      const helperStart = generatedHelperStarts[index]!;
      expect(
        mapGeneratedRangeToOriginal(virtualSource, {
          start: helperStart,
          length: helperName.length,
        }),
      ).toEqual(original);

      const generatedLiteralStart = helperStart + helperName.length + 1;
      expect(
        mapGeneratedRangeToOriginal(virtualSource, {
          start: generatedLiteralStart,
          length: original!.length,
        }),
      ).toEqual(original);
      expect(mapOriginalOffsetToGenerated(virtualSource, original!.start)).toBe(
        generatedLiteralStart,
      );
    }

    expect(outside).toBeDefined();
    expect(mapOriginalOffsetToGenerated(virtualSource, outside!.start)).toBe(
      helperImport.length + outside!.start,
    );
    expect(
      mapGeneratedRangeToOriginal(virtualSource, {
        start: 0,
        length: helperImport.length,
      }),
    ).toBeUndefined();
  });
});
