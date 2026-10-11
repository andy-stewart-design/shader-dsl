import { describe, expect, it } from "vitest";
import {
  analyzeFragment,
  createVirtualSource,
  mapGeneratedRangeToOriginal,
  mapOriginalOffsetToGenerated,
  ShaderDiagnosticCode,
  type TextRange,
} from "../src/index.js";

const text = `// UTF-16: 🎨
import { createFragmentShader, defineShaderFunction, vec4 } from "shdr";
import type { Expr, F32 } from "shdr";
const first = defineShaderFunction((x: Expr<F32>) => x / (2 + 3));
const ordinary = 1 / (2 + 3);
export default createFragmentShader(({ uniforms }) => vec4(first(uniforms.time), 0, 0, 1));
const second = defineShaderFunction((x: Expr<F32>) => {
  const value = -x * 0.5;
  return value + 1;
});
`;
function snippet(source: string, range: TextRange): string {
  return source.slice(range.start, range.start + range.length);
}
function rangeOf(source: string, token: string, from = 0): TextRange {
  const start = source.indexOf(token, from);
  expect(start).toBeGreaterThanOrEqual(0);
  return { start, length: token.length };
}

describe("local helper virtual-source mapping", () => {
  it.each(["LF", "CRLF"])(
    "maps all helper/fragment roots precisely with %s and non-BMP text",
    (lineEndings) => {
      const source =
        lineEndings === "CRLF" ? text.replaceAll("\n", "\r\n") : text;
      const analysis = analyzeFragment(source);
      expect(analysis.parsed.info).toBeDefined();
      expect(analysis.lowered.ok).toBe(true);
      expect(analysis.virtual.ok).toBe(true);
      if (!analysis.virtual.ok) return;
      const virtual = analysis.virtual.virtualSource;
      expect(createVirtualSource(source)).toEqual(analysis.virtual);
      const regions = virtual.shaderRegions!;
      expect(regions).toEqual(analysis.parsed.shaderRegions);
      expect(regions).toHaveLength(3);
      expect(regions[1]).toEqual(virtual.shaderRegion);
      expect(snippet(source, regions[0]!)).toBe(
        "first = defineShaderFunction((x: Expr<F32>) => x / (2 + 3))",
      );
      expect(snippet(source, regions[2]!)).toContain(
        "second = defineShaderFunction",
      );
      for (const [index, region] of regions.entries()) {
        if (index > 0)
          expect(region.start).toBeGreaterThanOrEqual(
            regions[index - 1]!.start + regions[index - 1]!.length,
          );
      }
      expect(virtual.operations).toHaveLength(5);
      expect(virtual.code).toContain("const ordinary = 1 / (2 + 3);");
      expect(virtual.code).toContain(
        "__shdr_internal_div(x, (__shdr_internal_add(__shdr_internal_f32(2), __shdr_internal_f32(3))))",
      );
      expect(virtual.code).toContain(
        "__shdr_internal_mul(__shdr_internal_neg(x), __shdr_internal_f32(0.5))",
      );
      const originalRoots = [
        "x / (2 + 3)",
        "2 + 3",
        "-x",
        "-x * 0.5",
        "value + 1",
      ];
      expect(
        virtual.operations
          .map((operation) => snippet(source, operation.original))
          .sort(),
      ).toEqual(originalRoots.sort());
      for (const operation of virtual.operations) {
        expect(
          mapGeneratedRangeToOriginal(virtual, operation.generated),
        ).toEqual(operation.original);
        expect(
          regions.filter(
            (region) =>
              operation.original.start >= region.start &&
              operation.original.start + operation.original.length <=
                region.start + region.length,
          ),
        ).toHaveLength(1);
      }
      for (const token of [
        "first =",
        "x /",
        "uniforms.time",
        "second =",
        "x *",
        "value +",
        "ordinary =",
      ]) {
        const range = rangeOf(source, token);
        const name = snippet(source, range).match(/^\w+/)![0];
        const original = { start: range.start, length: name.length };
        const generated = mapOriginalOffsetToGenerated(
          virtual,
          original.start,
        )!;
        expect(virtual.code.slice(generated, generated + name.length)).toBe(
          name,
        );
        expect(
          mapGeneratedRangeToOriginal(virtual, {
            start: generated,
            length: name.length,
          }),
        ).toEqual(original);
      }
      // The generated import has no authored owner; helper wrappers map only to
      // their own expression, never to a similarly spelled fragment operand.
      expect(
        mapGeneratedRangeToOriginal(virtual, { start: 0, length: 6 }),
      ).toBeUndefined();
      const wrapper = virtual.code.indexOf("__shdr_internal_div(");
      expect(
        mapGeneratedRangeToOriginal(virtual, {
          start: wrapper,
          length: "__shdr_internal_div".length,
        }),
      ).toEqual(rangeOf(source, "x / (2 + 3)"));
    },
  );

  it.each([
    ["x: Expr<F32>", "x", ShaderDiagnosticCode.InvalidShaderFunction],
    ["x / (2 + 3)", "captured", ShaderDiagnosticCode.ClosureCapture],
  ])(
    "retains separate boundaries when %s fails before fragment validation",
    (token, replacement, code) => {
      const source = text.replace(token, replacement);
      const analysis = analyzeFragment(source);
      expect(analysis.virtual.ok).toBe(false);
      expect(analysis.lowered).toMatchObject({
        ok: false,
        diagnostics: [expect.objectContaining({ code })],
      });
      if (analysis.virtual.ok) return;
      expect(analysis.virtual.diagnostics).toEqual(
        analysis.lowered.diagnostics,
      );
      expect(analysis.virtual.shaderRegions).toEqual(
        analysis.parsed.shaderRegions,
      );
      expect(analysis.virtual.shaderRegions).toHaveLength(3);
      expect(snippet(source, analysis.virtual.shaderRegion!)).toContain(
        "vec4(first(uniforms.time)",
      );
      const ordinary = source.indexOf("ordinary =");
      expect(
        analysis.virtual.shaderRegions!.some(
          (region) =>
            ordinary >= region.start && ordinary < region.start + region.length,
        ),
      ).toBe(false);
    },
  );

  it("preserves the legacy one-callback shape when no helper boundary exists", () => {
    const source = `import { createFragmentShader, vec4 } from "shdr";
const defineShaderFunction = () => 1;
const ordinary = defineShaderFunction();
export default createFragmentShader(({ uniforms }) => vec4(uniforms.time));`;
    const analysis = analyzeFragment(source);
    expect(analysis.lowered.ok).toBe(true);
    expect(analysis.parsed.shaderRegions).toBeUndefined();
    expect(analysis.virtual.ok).toBe(true);
    if (analysis.virtual.ok) {
      expect(analysis.virtual.virtualSource.shaderRegions).toBeUndefined();
      expect(analysis.virtual.virtualSource.code).toBe(source);
    }
  });
});
