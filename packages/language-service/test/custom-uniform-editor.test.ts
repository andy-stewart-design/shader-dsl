import { createVirtualSource } from "@shdr/core";
import { compileFragmentArtifact } from "@shdr/core/browser";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TypeScript7CheckerAdapter,
  TypeScript7EditorAdapter,
} from "../src/index.js";

const projectDirectory = fileURLToPath(
  new URL("fixtures/project/", import.meta.url),
);
describe("custom uniforms in TypeScript 7", () => {
  it.each(["custom-uniforms", "named-custom-uniforms"])(
    "infers shader expression hover types for %s",
    (name) => {
      const fileName = join(projectDirectory, `${name}.shdr.ts`);
      const source = readFileSync(fileName, "utf8");
      const virtual = createVirtualSource(source, fileName);
      expect(virtual.ok, JSON.stringify(virtual.diagnostics)).toBe(true);
      if (!virtual.ok) return;
      expect(virtual.virtualSource.code).toContain(
        `u.f32(${name === "custom-uniforms" ? "12" : "24"})`,
      );
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
          for (const [token, type] of [
            ["uniforms.color.x", "Expr<Vec3<F32>>"],
            ["uniforms.color.y", "Expr<Vec3<F32>>"],
            ["uniforms.dpi", "Expr<F32>"],
          ] as const) {
            const property = token.split(".")[1]!;
            const position = source.indexOf(token) + "uniforms.".length;
            expect(
              checked.getQuickInfoAtOriginalPosition(position),
            ).toMatchObject({
              name: property,
              display: type,
            });
          }
          expect(compileFragmentArtifact(source).ok).toBe(true);
        } finally {
          checked.dispose();
        }
      } finally {
        adapter.dispose();
      }
    },
  );

  it("maps texture handles and sample calls through the virtual editor source", () => {
    const fileName = join(projectDirectory, "sampled-texture.shdr.ts");
    const source = readFileSync(fileName, "utf8");
    const virtual = createVirtualSource(source, fileName);
    expect(virtual.ok, JSON.stringify(virtual.diagnostics)).toBe(true);
    if (!virtual.ok) return;
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
          checked.getQuickInfoAtOriginalPosition(
            source.indexOf("uniforms.photo") + "uniforms.".length,
          ),
        ).toMatchObject({ name: "photo", display: "Texture2D" });
        expect(compileFragmentArtifact(source).ok).toBe(true);
      } finally {
        checked.dispose();
      }
    } finally {
      adapter.dispose();
    }
  });

  it("routes invalid texture samples for imported schemas and unsaved edits", () => {
    const fileName = join(projectDirectory, "sampled-texture-imported.shdr.ts");
    const source = readFileSync(fileName, "utf8");
    const adapter = new TypeScript7EditorAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    try {
      const valid = adapter.updateDocument({
        fileName,
        source,
        version: 1,
        projectVersion: 1,
      });
      expect(valid.diagnostics).toEqual([]);

      const invalidSource = source.replace(
        "sample(uniforms.photo, coord.xy / uniforms.resolution)",
        "sample(uniforms.photo)",
      );
      const invalid = adapter.updateDocument({
        fileName,
        source: invalidSource,
        version: 2,
        projectVersion: 1,
      });
      const callStart = invalidSource.indexOf("sample(uniforms.photo)");
      expect(invalid.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "shdr",
            code: "SHDR1208",
            range: {
              start: callStart,
              length: "sample(uniforms.photo)".length,
            },
          }),
        ]),
      );

      const restored = adapter.updateDocument({
        fileName,
        source,
        version: 3,
        projectVersion: 1,
      });
      expect(restored.diagnostics).toEqual([]);
    } finally {
      adapter.dispose();
    }
  });

  it("reports the same source range for dynamic defaults in core and editor", () => {
    const fileName = join(projectDirectory, "named-custom-uniforms.shdr.ts");
    const source = readFileSync(fileName, "utf8").replace(
      "u.f32(24)",
      "u.f32(window.devicePixelRatio)",
    );
    const core = compileFragmentArtifact(source);
    expect(core.ok).toBe(false);
    if (core.ok) return;
    const adapter = new TypeScript7EditorAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    try {
      const document = adapter.updateDocument({
        fileName,
        source,
        version: 1,
        projectVersion: 1,
      });
      expect(document.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "SHDR1210",
            range: core.diagnostics[0]!.range,
          }),
        ]),
      );
    } finally {
      adapter.dispose();
    }
  });
});
