import { describe, expect, it } from "vitest";

import { createVirtualSource, ShaderDiagnosticCode } from "../src/index.js";
import { readShaderFixture } from "./read-shader-fixture.js";

describe("createVirtualSource", () => {
  it("returns transformed virtual source for the valid target file", async () => {
    const source = await readShaderFixture("gradient");

    const result = createVirtualSource(source, "gradient.shdr.ts");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.diagnostics).toEqual([]);
    expect(result.virtualSource.code).toContain(
      "__shdr_internal_div(coord.xy, uniforms.resolution)",
    );
    expect(result.virtualSource.code).toContain("__shdr_internal_f32(0)");
    expect(result.virtualSource.mappings.length).toBeGreaterThan(0);
  });

  it("returns diagnostics without virtual source for an invalid boundary", async () => {
    const source = await readShaderFixture("boundary/aliased-import");

    const result = createVirtualSource(source, "aliased-import.shdr.ts");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe(ShaderDiagnosticCode.ImportAlias);
    expect("virtualSource" in result).toBe(false);
  });

  it("returns diagnostics without virtual source for unsupported callback syntax", async () => {
    const source = await readShaderFixture("syntax/let");

    const result = createVirtualSource(source, "let.shdr.ts");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe(
      ShaderDiagnosticCode.InvalidVariableDeclaration,
    );
    expect("virtualSource" in result).toBe(false);
  });

  it("produces identical output and mappings on repeated calls", async () => {
    const source = await readShaderFixture("nested-division");

    const first = createVirtualSource(source, "nested-division.shdr.ts");
    const second = createVirtualSource(source, "nested-division.shdr.ts");

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });
});
