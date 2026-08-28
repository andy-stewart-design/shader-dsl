import { createVirtualSource } from "@shdr/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TypeScript7CheckerAdapter } from "../src/index.js";

const projectDirectory = fileURLToPath(
  new URL("fixtures/project/", import.meta.url),
);

describe("original-source QuickInfo", () => {
  it("maps supported shader hovers through virtual TypeScript", () => {
    const fileName = join(projectDirectory, "gradient.shdr.ts");
    const source = readFileSync(fileName, "utf8");
    const virtual = createVirtualSource(source, fileName);
    expect(virtual.ok).toBe(true);
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
        const division = source.indexOf("coord.xy / uniforms.resolution");
        const uvDeclaration = source.indexOf("const uv") + "const ".length;
        const uvReference = source.indexOf("uv.x");
        const cases = [
          {
            label: "coord",
            position: division,
            name: "coord",
            display: "Expr<Vec4<F32>>",
            token: "coord",
          },
          {
            label: "coord.xy",
            position: division + "coord.".length,
            name: "xy",
            display: "Expr<Vec2<F32>>",
            token: "xy",
          },
          {
            label: "uniforms.resolution",
            position: division + "coord.xy / uniforms.".length,
            name: "resolution",
            display: "Expr<Vec2<F32>>",
            token: "resolution",
          },
          {
            label: "uv declaration",
            position: uvDeclaration,
            name: "uv",
            display: "Expr<Vec2<F32>>",
            token: "uv",
          },
          {
            label: "uv reference",
            position: uvReference,
            name: "uv",
            display: "Expr<Vec2<F32>>",
            token: "uv",
          },
          {
            label: "uv.x",
            position: uvReference + "uv.".length,
            name: "x",
            display: "Expr<F32>",
            token: "x",
          },
        ] as const;

        for (const expected of cases) {
          const quickInfo = checked.getQuickInfoAtOriginalPosition(
            expected.position,
          );
          expect(quickInfo, expected.label).toMatchObject({
            name: expected.name,
            display: expected.display,
          });
          expect(
            source.slice(
              quickInfo!.range.start,
              quickInfo!.range.start + quickInfo!.range.length,
            ),
            expected.label,
          ).toBe(expected.token);
        }

        const propertyDot = division + "coord".length;
        expect(
          checked.getQuickInfoAtOriginalPosition(propertyDot),
        ).toMatchObject({
          name: "xy",
          display: "Expr<Vec2<F32>>",
        });

        const outsidePosition = source.indexOf("createFragmentShader");
        const outside = checked.getQuickInfoAtOriginalPosition(outsidePosition);
        expect(outside).toMatchObject({
          name: "createFragmentShader",
          display:
            "(_callback: (context: FragmentContext) => Expr<Vec4<F32>>) => FragmentShaderSource",
          range: {
            start: outsidePosition,
            length: "createFragmentShader".length,
          },
        });

        expect(
          checked.getQuickInfoAtOriginalPosition(source.indexOf("/")),
        ).toBeUndefined();

        const sameLengthExpression = "coord.xy / coord.xy";
        expect(sameLengthExpression).toHaveLength("__shdr_internal_div".length);
        expect(
          checked.getQuickInfoAtOriginalPosition(
            source.indexOf("/", source.indexOf(sameLengthExpression)),
          ),
        ).toBeUndefined();
      } finally {
        checked.dispose();
      }
    } finally {
      adapter.dispose();
    }
  });
});
