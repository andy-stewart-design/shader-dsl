import { createVirtualSource } from "@shdr/core";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TypeScript7EditorAdapter } from "../src/index.js";

const projectDirectory = fileURLToPath(
  new URL("fixtures/project/", import.meta.url),
);
const fileName = `${projectDirectory}/module-constants.shdr.ts`;
const helperFileName = `${projectDirectory}/imported-helper.shdr.ts`;
const entryFileName = `${projectDirectory}/module-entry.shdr.ts`;

const source = `import { createFragmentShader, vec2, vec4 } from "shdr";
const RADIUS = 0.1;
const CENTER = vec2(0, RADIUS);
export default createFragmentShader(({ coord }) =>
  vec4(coord.x * RADIUS, CENTER.x, RADIUS, 1),
);
`;

function adapter(): TypeScript7EditorAdapter {
  return new TypeScript7EditorAdapter({
    cwd: projectDirectory,
    projectFileName: "tsconfig.json",
  });
}

describe("module constants in the TypeScript 7 editor adapter", () => {
  it("types scalar and vector constants only in shader regions", () => {
    const virtual = createVirtualSource(source, fileName);
    expect(virtual.ok, JSON.stringify(virtual)).toBe(true);
    if (!virtual.ok) return;
    expect(virtual.virtualSource.code).toContain(
      "const RADIUS = __shdr_internal_f32(0.1);",
    );
    expect(virtual.virtualSource.code).toContain(
      "const CENTER = vec2(__shdr_internal_f32(0), RADIUS);",
    );
    expect(virtual.virtualSource.shaderRegions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          start: source.indexOf("const RADIUS"),
        }),
        expect.objectContaining({
          start: source.indexOf("({ coord }) =>"),
        }),
      ]),
    );

    const editor = adapter();
    try {
      const document = editor.updateDocument({
        fileName,
        source,
        version: 1,
        projectVersion: 1,
      });
      expect(document.diagnostics).toEqual([]);
      expect(
        document.getQuickInfoAtPosition(source.indexOf("RADIUS")),
        JSON.stringify(
          document.getQuickInfoAtPosition(source.indexOf("RADIUS")),
        ),
      ).toMatchObject({ display: "0.1" });
      expect(
        document.getQuickInfoAtPosition(source.indexOf("CENTER")),
      ).toMatchObject({
        display: expect.stringContaining("Vec2<F32>"),
      });
      const use = source.lastIndexOf("RADIUS");
      expect(document.getQuickInfoAtPosition(use)).toMatchObject({
        name: "RADIUS",
        display: "Expr<F32>",
        range: { start: use, length: "RADIUS".length },
      });
      const vectorUse = source.lastIndexOf("CENTER");
      expect(document.getQuickInfoAtPosition(vectorUse)).toMatchObject({
        name: "CENTER",
        display: expect.stringContaining("Vec2<F32>"),
        range: { start: vectorUse, length: "CENTER".length },
      });
    } finally {
      editor.dispose();
    }
  });

  it("types private helper constants and refreshes an edit", () => {
    const valid = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
const SCALE = 0.5;
export const scale = defineShaderFunction((x: Expr<F32>) => x * SCALE);
`;
    const invalid = valid.replace(
      "const SCALE = 0.5;",
      "const SCALE = hostScale;",
    );
    const editor = adapter();
    try {
      const first = editor.updateDocument({
        fileName: helperFileName,
        source: valid,
        version: 1,
        projectVersion: 1,
      });
      expect(first.diagnostics).toEqual([]);
      expect(
        first.getQuickInfoAtPosition(valid.indexOf("SCALE")),
        JSON.stringify(first.getQuickInfoAtPosition(valid.indexOf("SCALE"))),
      ).toMatchObject({ display: "0.5" });

      const entry = `import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./imported-helper.shdr.ts";
export default createFragmentShader(({ uniforms }) =>
  vec4(scale(uniforms.time), 0, 0, 1),
);
`;
      const healthyConsumer = editor.updateDocument({
        fileName: entryFileName,
        source: entry,
        version: 1,
        projectVersion: 1,
      });
      expect(healthyConsumer.diagnostics).toEqual([]);

      const failed = editor.updateDocument({
        fileName: helperFileName,
        source: invalid,
        version: 2,
        projectVersion: 2,
      });
      expect(failed.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "shdr",
            code: "SHDR1108",
            range: expect.objectContaining({
              start: invalid.indexOf("hostScale"),
            }),
          }),
        ]),
      );
      expect(
        failed.diagnostics.filter(({ source }) => source === "typescript"),
      ).toEqual([]);

      const refreshed = editor.updateDocument({
        fileName: entryFileName,
        source: entry,
        version: 2,
        projectVersion: 1,
      });
      expect(refreshed.diagnostics).toEqual([]);

      const restored = editor.updateDocument({
        fileName: helperFileName,
        source: valid,
        version: 3,
        projectVersion: 3,
      });
      expect(restored.diagnostics).toEqual([]);
      const restoredConsumer = editor.updateDocument({
        fileName: entryFileName,
        source: entry,
        version: 3,
        projectVersion: 1,
      });
      expect(restoredConsumer.diagnostics).toEqual([]);
    } finally {
      editor.dispose();
    }
  });

  it("preserves ordinary TypeScript and rejects arithmetic initializers", () => {
    const invalid = source.replace(
      "const RADIUS = 0.1;",
      "const RADIUS = 0.1 + 0.2;",
    );
    const editor = adapter();
    try {
      const ordinary = editor.updateDocument({
        fileName: `${projectDirectory}/ordinary.ts`,
        source: "const radius: number = 0.1;\nconst copy = radius;\n",
        version: 1,
        projectVersion: 1,
      });
      expect(ordinary.delegated).toBe(true);
      expect(ordinary.diagnostics).toEqual([]);

      const document = editor.updateDocument({
        fileName,
        source: invalid,
        version: 2,
        projectVersion: 1,
      });
      expect(document.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "shdr",
            code: "SHDR1105",
            range: expect.objectContaining({
              start: invalid.indexOf("0.1 + 0.2"),
            }),
          }),
        ]),
      );
    } finally {
      editor.dispose();
    }
  });
});
