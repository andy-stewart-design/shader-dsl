import { describe, expect, it } from "vitest";
import {
  analyzeFragment,
  createVirtualSource,
  lowerFragment,
  parseShaderFile,
  ShaderDiagnosticCode,
} from "../src/index.js";

const header = 'import { createFragmentShader, vec4 } from "shdr";\n';

function source(body: string): string {
  return `${header}export default createFragmentShader(({ coord, uniforms }) => {
  ${body}
});`;
}

describe("shared frontend analysis", () => {
  it("returns the same parsed, virtual and lowered results from one source", () => {
    const input = source(
      "const uv = coord.xy / uniforms.resolution; return vec4(uv, uniforms.time, 1);",
    );
    const analysis = analyzeFragment(input);
    expect(analysis.parsed).toEqual(parseShaderFile(input));
    expect(analysis.virtual).toEqual(createVirtualSource(input));
    expect(analysis.lowered).toEqual(lowerFragment(input));
    expect(analysis.parsed.info?.callback.range).toEqual(
      analysis.virtual.ok
        ? analysis.virtual.virtualSource.shaderRegion
        : undefined,
    );
    expect(analyzeFragment(input, "named.shdr.ts").parsed.info?.fileName).toBe(
      "named.shdr.ts",
    );
  });

  it("keeps virtual source available when lowering reports original-source errors", () => {
    const input = source("return vec4(1e999, 0, 0, 1);");
    const analysis = analyzeFragment(input);
    expect(analysis.virtual.ok).toBe(true);
    expect(analysis.lowered).toEqual(lowerFragment(input));
    expect(analysis.lowered).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidNumericLiteral,
          range: { start: input.indexOf("1e999"), length: 5 },
        },
      ],
    });
  });

  it("shares parse failures and shader boundaries with both consumers", () => {
    for (const input of [
      source("return vec4(1 + ;"),
      source("return vec4(1, 0, 0, 1);").replace(
        "({ coord, uniforms })",
        "async ({ coord, uniforms })",
      ),
    ]) {
      const analysis = analyzeFragment(input);
      expect(analysis.parsed.info).toBeUndefined();
      expect(analysis.virtual).toEqual(createVirtualSource(input));
      expect(analysis.lowered).toEqual(lowerFragment(input));
      if (!analysis.virtual.ok) {
        expect(analysis.virtual.shaderRegion).toEqual(
          analysis.parsed.shaderRegion,
        );
        expect(analysis.virtual.diagnostics).toEqual(
          analysis.parsed.diagnostics,
        );
      }
      expect(analysis.lowered.diagnostics).toEqual(analysis.parsed.diagnostics);
    }
  });
});
