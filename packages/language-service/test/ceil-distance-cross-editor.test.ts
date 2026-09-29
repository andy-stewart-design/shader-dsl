import { lowerFragment, ShaderDiagnosticCode } from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TypeScript7EditorAdapter } from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));
const fileName = join(cwd, "gradient.shdr.ts");
const cases = [
  ["ceil(s)", "s"],
  ["ceil(v2)", "v2"],
  ["ceil(v3)", "v3"],
  ["ceil(v4)", "v4"],
  ["distance(s, s)", "s"],
  ["distance(v2, v2)", "s"],
  ["distance(v3, v3)", "s"],
  ["distance(v4, v4)", "s"],
  ["cross(v3, v3)", "v3"],
] as const;

function source(call: string, shape: string): string {
  const result = shape === "s" ? "value" : "value.x";
  return `import { createFragmentShader, vec4, ceil, distance, cross } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const value = ${call};
  return vec4(${result}, 0, 0, 1);
});`;
}

describe("ceil, distance and cross in the shared TypeScript 7 editor", () => {
  it("hovers all nine accepted signatures without diagnostics", () => {
    const adapter = new TypeScript7EditorAdapter({
      cwd,
      projectFileName: "tsconfig.json",
    });
    try {
      for (const [index, [call, shape]] of cases.entries()) {
        const text = source(call, shape);
        const document = adapter.updateDocument({
          fileName,
          source: text,
          version: index + 1,
          projectVersion: 1,
        });
        expect(document.diagnostics, call).toEqual([]);
        expect(
          document.getQuickInfoAtPosition(text.indexOf("value =")),
          call,
        ).toMatchObject({
          display: shape === "s" ? "Expr<F32>" : `Expr<Vec${shape[1]}<F32>>`,
        });
      }
    } finally {
      adapter.dispose();
    }
  });

  it("keeps invalid call diagnostics and ranges in sync with core", () => {
    const adapter = new TypeScript7EditorAdapter({
      cwd,
      projectFileName: "tsconfig.json",
    });
    try {
      for (const [index, call] of [
        "ceil(s, s)",
        "distance(s, v2)",
        "distance(v2, v3)",
        "cross(v2, v2)",
        "cross(v4, v4)",
      ].entries()) {
        const text = source(call, call.startsWith("cross(") ? "v3" : "s");
        const lowered = lowerFragment(text);
        expect(lowered, call).toMatchObject({
          ok: false,
          diagnostics: [
            {
              code: ShaderDiagnosticCode.InvalidBuiltin,
              range: { start: text.indexOf(call), length: call.length },
            },
          ],
        });
        if (lowered.ok) continue;
        const document = adapter.updateDocument({
          fileName,
          source: text,
          version: index + 1,
          projectVersion: 1,
        });
        expect(document.diagnostics, call).toEqual(
          lowered.diagnostics.map(({ code, message, range }) => ({
            code,
            message,
            range,
            source: "shdr",
            category: "error",
          })),
        );
        expect(
          document.getQuickInfoAtPosition(text.indexOf(call) + 1),
        ).toBeUndefined();
      }
    } finally {
      adapter.dispose();
    }
  });
});
