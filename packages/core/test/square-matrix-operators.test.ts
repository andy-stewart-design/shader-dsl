import { describe, expect, it } from "vitest";
import { generateFragmentOutput } from "../src/generate-fragment.js";
import { lowerFragment, ShaderDiagnosticCode } from "../src/index.js";

type Size = 2 | 3 | 4;
type Family = "M+M" | "M-M" | "M*S" | "S*M" | "M*V" | "V*M" | "M*M";

const families: readonly Family[] = [
  "M+M",
  "M-M",
  "M*S",
  "S*M",
  "M*V",
  "V*M",
  "M*M",
];
const sizes: readonly Size[] = [2, 3, 4];

function source(size: Size, family: Family): string {
  const matrix = `mat${size}`;
  const vector = `vec${size}`;
  const expression = {
    "M+M": "a + b",
    "M-M": "a - b",
    "M*S": "a * scalar",
    "S*M": "scalar * a",
    "M*V": "a * vector",
    "V*M": "vector * a",
    "M*M": "a * b",
  }[family];
  const imports =
    vector === "vec4" ? `${matrix}, vec4` : `${matrix}, ${vector}, vec4`;
  return `import { createFragmentShader, ${imports} } from "shdr";
export default createFragmentShader(() => {
  const a = ${matrix}(1);
  const b = ${matrix}(2);
  const scalar = 3;
  const vector = ${vector}(1);
  const result = ${expression};
  return vec4(1);
});`;
}

function resultType(size: Size, family: Family) {
  return family === "M*V" || family === "V*M"
    ? { kind: "vector", scalar: "f32", size }
    : { kind: "matrix", scalar: "f32", columns: size, rows: size };
}

describe("square matrix native arithmetic", () => {
  it("accepts exactly the seven binary families at every square size", () => {
    for (const size of sizes) {
      for (const family of families) {
        const lowered = lowerFragment(source(size, family));
        expect(
          lowered.ok,
          `M${size} ${family}: ${JSON.stringify(lowered)}`,
        ).toBe(true);
        if (!lowered.ok) continue;
        const result = lowered.ir.statements.find(
          (statement) =>
            statement.kind === "const-declaration" &&
            statement.name === "result",
        );
        expect(result?.kind, `M${size} ${family}`).toBe("const-declaration");
        if (result?.kind !== "const-declaration") continue;
        expect(result.initializer.type, `M${size} ${family}`).toEqual(
          resultType(size, family),
        );
      }
    }
  });

  it("preserves authored grouping and operand direction for nested products", () => {
    const text = `import { createFragmentShader, mat2, vec2, vec4 } from "shdr";
export default createFragmentShader(() => {
  const a = mat2(1, 2, 3, 4);
  const b = mat2(2, 0, 1, 3);
  const vector = vec2(5, 6);
  const nested = a * (b * vector);
  const composed = (a * b) * vector;
  return vec4(nested.x, composed.x, 0, 1);
});`;
    const result = lowerFragment(text);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const glsl = generateFragmentOutput(result.ir, "glsl-es-300").code;
    const wgsl = generateFragmentOutput(result.ir, "wgsl").code;
    expect(glsl).toContain("a * (b * vector)");
    expect(glsl).toContain("a * b * vector");
    expect(wgsl).toContain("a * (b * vector)");
    expect(wgsl).toContain("a * b * vector");
  });

  it("preserves the old scalar/vector boundary and rejects excluded matrix operations", () => {
    const cases = [
      [
        "const a = mat2(1); const b = mat3(1); return vec4(a + b);",
        "mat2, mat3, vec4",
      ],
      ["const a = mat2(1); return vec4(a + 1);", "mat2, vec4"],
      ["const a = mat2(1); return vec4(a / 2);", "mat2, vec4"],
      ["const a = mat2(1); return vec4(2 / a);", "mat2, vec4"],
      [
        "const a = mat2(1); return vec4(2 * vec2(1, 2), 0, 1);",
        "mat2, vec2, vec4",
      ],
    ] as const;
    for (const [body, imports] of cases) {
      const text = `import { createFragmentShader, ${imports} } from "shdr";
export default createFragmentShader(() => { ${body} });`;
      const result = lowerFragment(text);
      expect(result.ok, body).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostics[0]?.code, body).toBe(
        ShaderDiagnosticCode.InvalidBinaryOperation,
      );
    }
  });
});
