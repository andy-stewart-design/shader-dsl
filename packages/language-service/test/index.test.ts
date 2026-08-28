import { createVirtualSource } from "@shdr/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  languageServicePackageName,
  TypeScript7CheckerAdapter,
} from "../src/index.js";

const projectDirectory = fileURLToPath(
  new URL("fixtures/project/", import.meta.url),
);

describe("@shdr/language-service package", () => {
  it("exports its package marker", () => {
    expect(languageServicePackageName).toBe("@shdr/language-service");
  });

  it("checks virtual shader source with the real TypeScript 7 project", () => {
    const fileName = join(projectDirectory, "gradient.shdr.ts");
    const source = readFileSync(fileName, "utf8");
    const virtual = createVirtualSource(source, fileName);
    expect(virtual.ok).toBe(true);
    if (!virtual.ok) return;
    expect(virtual.virtualSource.code).toContain('from "shdr/internal"');

    const adapter = new TypeScript7CheckerAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });

    try {
      const checked = adapter.checkVirtualSource(
        fileName,
        virtual.virtualSource,
      );
      try {
        expect(checked.semanticDiagnostics).toEqual([]);
        expect(
          checked.semanticDiagnostics.filter(
            (diagnostic) =>
              diagnostic.code === 2307 ||
              diagnostic.message.includes("shdr/internal"),
          ),
        ).toEqual([]);

        expect(checked.getTypeOfNamedDeclaration("uv")).toMatchObject({
          name: "uv",
          display: "Expr<Vec2<F32>>",
        });
        expect(checked.getTypeOfNamedDeclaration("color")).toMatchObject({
          name: "color",
          display: "Expr<Vec4<F32>>",
        });

        const uvReference = virtual.virtualSource.code.indexOf("uv.x");
        const quickInfo = checked.getQuickInfoAtGeneratedPosition(uvReference);
        expect(quickInfo).toMatchObject({
          name: "uv",
          display: "Expr<Vec2<F32>>",
        });
        expect(
          virtual.virtualSource.code.slice(
            quickInfo!.range.start,
            quickInfo!.range.start + quickInfo!.range.length,
          ),
        ).toBe("uv");
      } finally {
        checked.dispose();
      }
    } finally {
      adapter.dispose();
    }
  });
});
