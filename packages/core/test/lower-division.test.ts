import { describe, expect, it } from "vitest";

import {
  lowerShaderSyntax,
  parseShaderFile,
  type ShaderConstDeclaration,
} from "../src/index.js";

describe("division lowering", () => {
  it("preserves nested associativity, ranges, and resolved types", () => {
    const innerSource = "coord.xy / uniforms.resolution";
    const outerSource = `${innerSource} / uniforms.time`;
    const source = `import { createFragmentShader } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const result = ${outerSource};
  return coord;
});
`;
    const parsed = parseShaderFile(source, "nested-lowering.shdr.ts");
    expect(parsed.diagnostics).toEqual([]);
    if (!parsed.info) return;

    const result = lowerShaderSyntax(parsed.info.callback.syntax);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const declaration = result.module.statements[0] as
      ShaderConstDeclaration | undefined;
    expect(declaration?.kind).toBe("const-declaration");
    if (declaration?.kind !== "const-declaration") return;

    expect(declaration.initializer).toMatchObject({
      kind: "binary",
      operator: "/",
      type: { kind: "vector", scalar: "f32", size: 2 },
      range: {
        start: source.indexOf(outerSource),
        length: outerSource.length,
      },
      left: {
        kind: "binary",
        operator: "/",
        type: { kind: "vector", scalar: "f32", size: 2 },
        range: {
          start: source.indexOf(innerSource),
          length: innerSource.length,
        },
      },
      right: {
        kind: "default-uniform",
        uniform: "time",
        type: { kind: "scalar", scalar: "f32" },
      },
    });
  });
});
