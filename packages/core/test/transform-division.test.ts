import { describe, expect, it } from "vitest";

import {
  mapGeneratedRangeToOriginal,
  mapOriginalOffsetToGenerated,
  parseShaderFile,
  type TextRange,
} from "../src/index.js";
import { transformShaderExpressions } from "../src/transform-shader-expressions.js";
import { readShaderFixture } from "./read-shader-fixture.js";

const divHelper = "__shdr_internal_div";
const f32Helper = "__shdr_internal_f32";
const helperImport = `import { ${divHelper}, ${f32Helper} } from "shdr/internal";\n`;

function rangeOfText(source: string, text: string, fromIndex = 0): TextRange {
  const start = source.indexOf(text, fromIndex);
  expect(start).toBeGreaterThanOrEqual(0);
  return { start, length: text.length };
}

describe("division transformation", () => {
  it("rewrites one division into an internal helper call", async () => {
    const source = await readShaderFixture("gradient");
    const parsed = parseShaderFile(source, "gradient.shdr.ts");
    expect(parsed.diagnostics).toEqual([]);

    const virtualSource = transformShaderExpressions(source, parsed.info!);
    const expected = `${helperImport}import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = ${divHelper}(coord.xy, uniforms.resolution);
  const color = vec4(uv.x, uv.y, ${f32Helper}(0), ${f32Helper}(1));

  return color;
});
`;

    expect(virtualSource.code).toBe(expected);
  });

  it("maps copied operands precisely and generated division text to the source expression", async () => {
    const source = await readShaderFixture("gradient");
    const parsed = parseShaderFile(source, "gradient-mappings.shdr.ts");
    const virtualSource = transformShaderExpressions(source, parsed.info!);
    const originalDivision = rangeOfText(
      source,
      "coord.xy / uniforms.resolution",
    );
    const generatedCallStart = virtualSource.code.indexOf(`${divHelper}(`);
    const generatedCallEnd = virtualSource.code.indexOf(
      ";",
      generatedCallStart,
    );
    const generatedCall = {
      start: generatedCallStart,
      length: generatedCallEnd - generatedCallStart,
    };

    expect(mapGeneratedRangeToOriginal(virtualSource, generatedCall)).toEqual(
      originalDivision,
    );
    expect(
      mapGeneratedRangeToOriginal(virtualSource, {
        start: generatedCallStart,
        length: divHelper.length,
      }),
    ).toEqual(originalDivision);

    for (const name of ["coord", "xy", "uniforms", "resolution"]) {
      const original = rangeOfText(source, name, originalDivision.start);
      const generated = rangeOfText(
        virtualSource.code,
        name,
        generatedCallStart,
      );
      expect(mapGeneratedRangeToOriginal(virtualSource, generated)).toEqual(
        original,
      );
      expect(mapOriginalOffsetToGenerated(virtualSource, original.start)).toBe(
        generated.start,
      );
    }

    const originalSlash = source.indexOf("/", originalDivision.start);
    expect(mapOriginalOffsetToGenerated(virtualSource, originalSlash)).toBe(
      generatedCallStart,
    );
  });

  it("preserves source outside the callback byte-for-byte", async () => {
    const source = await readShaderFixture("gradient");
    const parsed = parseShaderFile(source, "gradient-preservation.shdr.ts");
    const virtualSource = transformShaderExpressions(source, parsed.info!);
    const shaderRegion = parsed.info!.shaderRegion;
    const shaderRegionEnd = shaderRegion.start + shaderRegion.length;

    expect(
      virtualSource.code.startsWith(
        helperImport + source.slice(0, shaderRegion.start),
      ),
    ).toBe(true);
    expect(virtualSource.code.endsWith(source.slice(shaderRegionEnd))).toBe(
      true,
    );
  });
});
