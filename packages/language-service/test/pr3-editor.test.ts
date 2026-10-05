import { lowerFragment, ShaderDiagnosticCode } from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { TypeScript7EditorAdapter } from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));
function source(call: string): string {
  return `import { createFragmentShader, sqrt, exp, tanh, clamp, pow, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const result = ${call};
  return coord;
});`;
}
const examples = (["s", "v2", "v3", "v4"] as const).flatMap((shape) => [
  `sqrt(${shape})`,
  `exp(${shape})`,
  `tanh(${shape})`,
  `clamp(${shape}, ${shape}, ${shape})`,
  `pow(${shape}, ${shape})`,
]);

it("gives original-source diagnostics and correct TypeScript 7 QuickInfo for all 20 signatures", () => {
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    for (const [index, call] of examples.entries()) {
      const text = source(call);
      const result = adapter.updateDocument({
        fileName: join(cwd, `pr3-${index}.shdr.ts`),
        source: text,
        version: 1,
        projectVersion: 1,
      });
      const shape = call.match(/\((s|v[234])(?:,|\))/)?.[1]!;
      expect(lowerFragment(text).ok, call).toBe(true);
      expect(result.diagnostics, call).toEqual([]);
      expect(
        result.getQuickInfoAtPosition(text.indexOf("result =")),
        call,
      ).toMatchObject({
        display: shape === "s" ? "Expr<F32>" : `Expr<Vec${shape[1]}<F32>>`,
      });
    }
  } finally {
    adapter.dispose();
  }
});

it("owns partial-vector and compound-overflow errors at their original calls", () => {
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  const cases = [
    "sqrt(vec2(s, -1))",
    "exp(vec2(s, 1000))",
    "clamp(v2, vec2(s, 2), vec2(1))",
    "sqrt(alias.yx)",
    "pow(2, 130)",
    "pow(10, 39)",
    "sqrt(3e38 + 3e38)",
    "tanh(3e38 + 3e38)",
    "tanh(vec2(s, 3e38 + 3e38))",
    "sqrt(sin(3e38 + 3e38))",
    "sqrt(vec2(s, 3e38 + 3e38).x)",
  ];
  try {
    for (const [index, call] of cases.entries()) {
      const text = source(call)
        .replace("pow, vec2", "pow, sin, vec2")
        .replace(
          "  const result =",
          "  const alias = vec2(-1, s);\n  const result =",
        );
      const lowered = lowerFragment(text);
      expect(lowered.ok, call).toBe(false);
      if (lowered.ok) continue;
      const document = adapter.updateDocument({
        fileName: join(cwd, `pr3-known-${index}.shdr.ts`),
        source: text,
        version: 1,
        projectVersion: 1,
      });
      expect(
        document.diagnostics.filter((item) => item.source === "shdr"),
        call,
      ).toEqual([
        expect.objectContaining({
          code: ShaderDiagnosticCode.InvalidBuiltinDomain,
          range: { start: text.indexOf(call), length: call.length },
          message: lowered.diagnostics[0]!.message,
        }),
      ]);
    }
  } finally {
    adapter.dispose();
  }
});

it("matches core SHDR1208/SHDR1209 ranges and import boundaries without TS7 cascades", () => {
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  const calls = [
    source("pow(v3, s)"),
    source("clamp(v2, s, v2)"),
    source("sqrt(-1)"),
    source("pow(0, 0)"),
    source("exp(1000)"),
    source("clamp(v2, vec2(2), vec2(1))"),
    source("sqrt(pow(0, 0))"),
    source("sqrt(s)").replace("sqrt, exp", "exp"),
    source("pow(s, s)").replace("clamp, pow,", "clamp, pow as power,"),
  ];
  try {
    for (const [index, text] of calls.entries()) {
      const lowered = lowerFragment(text);
      expect(lowered.ok, text).toBe(false);
      if (lowered.ok) continue;
      const document = adapter.updateDocument({
        fileName: join(cwd, `pr3-invalid-${index}.shdr.ts`),
        source: text,
        version: 1,
        projectVersion: 1,
      });
      expect(
        document.diagnostics.filter((item) => item.source === "shdr"),
        text,
      ).toEqual([
        expect.objectContaining({
          code: lowered.diagnostics[0]!.code,
          range: lowered.diagnostics[0]!.range,
          message: lowered.diagnostics[0]!.message,
        }),
      ]);
      expect(
        document.diagnostics.map((item) => item.message).join("\n"),
        text,
      ).not.toContain("shdr_internal_");
      if (index < 2)
        expect(lowered.diagnostics[0]!.code).toBe(
          ShaderDiagnosticCode.InvalidBuiltin,
        );
      else if (index < 7)
        expect(lowered.diagnostics[0]!.code).toBe(
          ShaderDiagnosticCode.InvalidBuiltinDomain,
        );
    }
  } finally {
    adapter.dispose();
  }
});
