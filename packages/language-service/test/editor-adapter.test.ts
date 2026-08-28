import { ShaderDiagnosticCode } from "@shdr/core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TypeScript7EditorAdapter } from "../src/index.js";

const projectDirectory = fileURLToPath(
  new URL("fixtures/project/", import.meta.url),
);

function createAdapter(): TypeScript7EditorAdapter {
  return new TypeScript7EditorAdapter({
    cwd: projectDirectory,
    projectFileName: "tsconfig.json",
  });
}

describe("TypeScript 7 editor adapter", () => {
  it("routes shader diagnostics and QuickInfo through virtual source", () => {
    const fileName = join(projectDirectory, "gradient.shdr.ts");
    const source = readFileSync(fileName, "utf8");
    const adapter = createAdapter();

    try {
      const document = adapter.updateDocument({
        fileName,
        source,
        version: 1,
        projectVersion: 1,
      });

      expect(document.isShader).toBe(true);
      expect(document.delegated).toBe(false);
      expect(document.diagnostics).toEqual([]);
      expect(
        document.getQuickInfoAtPosition(source.indexOf("uv.x")),
      ).toMatchObject({
        name: "uv",
        display: "Expr<Vec2<F32>>",
      });
    } finally {
      adapter.dispose();
    }
  });

  it("delegates non-shader files to the standard TypeScript provider", () => {
    const fileName = join(projectDirectory, "ordinary.ts");
    const source = readFileSync(fileName, "utf8");
    const adapter = createAdapter();

    try {
      const document = adapter.updateDocument({
        fileName,
        source,
        version: 1,
        projectVersion: 1,
      });

      expect(document.isShader).toBe(false);
      expect(document.delegated).toBe(true);
      expect(document.diagnostics).toEqual([]);
      expect(
        document.getQuickInfoAtPosition(source.indexOf("ordinaryValue")),
      ).toBeUndefined();
    } finally {
      adapter.dispose();
    }
  });

  it("caches by source version and invalidates changed virtual state", () => {
    const fileName = join(projectDirectory, "gradient.shdr.ts");
    const source = readFileSync(fileName, "utf8");
    const adapter = createAdapter();

    try {
      const first = adapter.updateDocument({
        fileName,
        source,
        version: 1,
        projectVersion: 1,
      });
      const cached = adapter.updateDocument({
        fileName,
        source,
        version: 1,
        projectVersion: 1,
      });
      expect(cached).toBe(first);

      const invalidSource = source.replace(
        "coord.xy / uniforms.resolution",
        "coord.xy / coord",
      );
      const updated = adapter.updateDocument({
        fileName,
        source: invalidSource,
        version: 2,
        projectVersion: 1,
      });

      expect(updated).not.toBe(first);
      expect(updated.delegated).toBe(false);
      expect(
        first.getQuickInfoAtPosition(source.indexOf("uv.x")),
      ).toBeUndefined();
      expect(updated.diagnostics).toEqual([
        expect.objectContaining({
          code: 2769,
          source: "shdr",
          range: {
            start: invalidSource.indexOf("coord.xy / coord"),
            length: "coord.xy / coord".length,
          },
        }),
      ]);
      expect(updated.diagnostics[0]?.message).not.toContain("__shdr_internal");

      const reloadedProject = adapter.updateDocument({
        fileName,
        source: invalidSource,
        version: 2,
        projectVersion: 2,
      });
      expect(reloadedProject).not.toBe(updated);
      expect(
        updated.getQuickInfoAtPosition(source.indexOf("uv.x")),
      ).toBeUndefined();
      expect(reloadedProject.diagnostics).toHaveLength(1);

      adapter.closeDocument(fileName);
      expect(
        reloadedProject.getQuickInfoAtPosition(source.indexOf("uv.x")),
      ).toBeUndefined();
      const reopened = adapter.updateDocument({
        fileName,
        source,
        version: 3,
        projectVersion: 2,
      });
      expect(reopened.diagnostics).toEqual([]);
    } finally {
      adapter.dispose();
    }
  });

  it("surfaces core diagnostics for unsupported shader syntax", () => {
    const fileName = join(projectDirectory, "gradient.shdr.ts");
    const source = readFileSync(fileName, "utf8").replace(
      "const sameLength",
      "let sameLength",
    );
    const adapter = createAdapter();

    try {
      const document = adapter.updateDocument({
        fileName,
        source,
        version: 1,
        projectVersion: 1,
      });

      expect(document.diagnostics).toEqual([
        expect.objectContaining({
          code: ShaderDiagnosticCode.InvalidVariableDeclaration,
          source: "shdr",
        }),
      ]);
      expect(
        document.getQuickInfoAtPosition(source.indexOf("sameLength")),
      ).toBeUndefined();
      expect(
        document.getQuickInfoAtPosition(source.indexOf("createFragmentShader")),
      ).toMatchObject({ name: "createFragmentShader" });
    } finally {
      adapter.dispose();
    }
  });

  it("preserves TypeScript syntactic diagnostics", () => {
    const fileName = join(projectDirectory, "gradient.shdr.ts");
    const source = readFileSync(fileName, "utf8").replace(/\n\}\);\n$/, "\n");
    const adapter = createAdapter();

    try {
      const document = adapter.updateDocument({
        fileName,
        source,
        version: 1,
        projectVersion: 1,
      });

      expect(
        document.diagnostics.some(
          (diagnostic) =>
            diagnostic.source === "typescript" && diagnostic.code === 1005,
        ),
      ).toBe(true);
      expect(
        document.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === ShaderDiagnosticCode.TypeScriptSyntax,
        ),
      ).toBe(false);
    } finally {
      adapter.dispose();
    }
  });

  it("does not load a TypeScript 6 compiler or tsserver module", () => {
    const require = createRequire(import.meta.url);
    const typescriptPackage = JSON.parse(
      readFileSync(require.resolve("typescript/package.json"), "utf8"),
    ) as { readonly version: string };
    const loadedModules = Object.keys(require.cache);

    expect(typescriptPackage.version).toBe("7.0.2");
    expect(
      loadedModules.filter(
        (fileName) =>
          fileName.includes("@typescript/typescript6") ||
          /[/\\]tsserver(?:library)?\.[cm]?js$/.test(fileName),
      ),
    ).toEqual([]);
  });
});
