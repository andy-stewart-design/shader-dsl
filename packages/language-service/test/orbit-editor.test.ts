import { lowerFragment, ShaderDiagnosticCode } from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TypeScript7EditorAdapter } from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));

type Shape = "s" | "v2" | "v3" | "v4";
const shapeDisplay: Record<Shape, string> = {
  s: "Expr<F32>",
  v2: "Expr<Vec2<F32>>",
  v3: "Expr<Vec3<F32>>",
  v4: "Expr<Vec4<F32>>",
};

function fragmentSource(call: string, _shape: Shape = "s"): string {
  return `import { acos, asin, atan, createFragmentShader, degrees, mod, radians, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const result = ${call};
  return coord;
});`;
}

const examples: readonly [string, Shape][] = [
  ...(["asin", "acos", "atan", "radians", "degrees"] as const).flatMap((name) =>
    (["s", "v2", "v3", "v4"] as const).map(
      (shape) => [`${name}(${shape})`, shape] as [string, Shape],
    ),
  ),
  ["atan(s, s)", "s"],
  ["atan(v2, v2)", "v2"],
  ["atan(v3, v3)", "v3"],
  ["atan(v4, v4)", "v4"],
  ["mod(s, s)", "s"],
  ["mod(v2, v2)", "v2"],
  ["mod(v2, s)", "v2"],
  ["mod(v3, v3)", "v3"],
  ["mod(v3, s)", "v3"],
  ["mod(v4, v4)", "v4"],
  ["mod(v4, s)", "v4"],
];

describe("orbit math TypeScript 7 editor parity", () => {
  it("hovers all 31 concrete signatures with concrete result types", () => {
    expect(examples).toHaveLength(31);
    const adapter = new TypeScript7EditorAdapter({
      cwd,
      projectFileName: "tsconfig.json",
    });
    try {
      for (const [index, [call, shape]] of examples.entries()) {
        const source = fragmentSource(call, shape);
        const document = adapter.updateDocument({
          fileName: join(cwd, `orbit-${index}.shdr.ts`),
          source,
          version: 1,
          projectVersion: 1,
        });
        expect(document.diagnostics, call).toEqual([]);
        expect(
          document.getQuickInfoAtPosition(source.indexOf("result =")),
          call,
        ).toMatchObject({ display: shapeDisplay[shape] });
      }
    } finally {
      adapter.dispose();
    }
  });

  it("maps domain and shape failures to authored calls while accepting f32 endpoints", () => {
    const adapter = new TypeScript7EditorAdapter({
      cwd,
      projectFileName: "tsconfig.json",
    });
    try {
      const valid = fragmentSource("asin(1 + 1e-50)");
      expect(
        adapter.updateDocument({
          fileName: join(cwd, "orbit-endpoint.shdr.ts"),
          source: valid,
          version: 1,
          projectVersion: 1,
        }).diagnostics,
      ).toEqual([]);

      for (const [call, code] of [
        ["atan(v2, s)", ShaderDiagnosticCode.InvalidBuiltin],
        ["mod(s, v2)", ShaderDiagnosticCode.InvalidBuiltin],
        ["asin(vec2(s, 2))", ShaderDiagnosticCode.InvalidBuiltinDomain],
        ["atan(3e38 + 3e38)", ShaderDiagnosticCode.InvalidBuiltinDomain],
      ] as const) {
        const source = fragmentSource(call);
        const document = adapter.updateDocument({
          fileName: join(cwd, `orbit-invalid-${call.length}.shdr.ts`),
          source,
          version: 1,
          projectVersion: 1,
        });
        expect(
          document.diagnostics.filter((item) => item.source === "shdr"),
          call,
        ).toEqual([
          expect.objectContaining({
            source: "shdr",
            code,
            range: { start: source.indexOf(call), length: call.length },
          }),
        ]);
        expect(
          document.diagnostics.map((item) => item.message).join("\n"),
        ).not.toContain("shdr_internal_");
      }
    } finally {
      adapter.dispose();
    }
  });

  it("refreshes local and imported helper hovers and diagnostics", () => {
    const adapter = new TypeScript7EditorAdapter({
      cwd,
      projectFileName: "tsconfig.json",
    });
    const helperFile = join(cwd, "orbit-helper.shdr.ts");
    const entryFile = join(cwd, "orbit-entry.shdr.ts");
    const helper = `import { atan, defineShaderFunction } from "shdr";
import type { Expr, Vec3, F32 } from "shdr";
export const angle = defineShaderFunction((y: Expr<Vec3<F32>>, x: Expr<Vec3<F32>>) => atan(y, x));`;
    const entry = `import { createFragmentShader, vec4 } from "shdr";
import { angle } from "./orbit-helper.shdr.ts";
export default createFragmentShader(({ coord }) => {
  const result = angle(coord.xyz, coord.xyz);
  return vec4(result, result.x);
});`;
    try {
      const local = `import { atan, createFragmentShader, defineShaderFunction, vec4 } from "shdr";
import type { Expr, Vec3, F32 } from "shdr";
const angle = defineShaderFunction((y: Expr<Vec3<F32>>, x: Expr<Vec3<F32>>) => atan(y, x));
export default createFragmentShader(({ coord }) => {
  const result = angle(coord.xyz, coord.xyz);
  return vec4(result, result.x);
});`;
      const localDocument = adapter.updateDocument({
        fileName: join(cwd, "orbit-local.shdr.ts"),
        source: local,
        version: 1,
        projectVersion: 1,
      });
      expect(localDocument.diagnostics).toEqual([]);
      expect(
        localDocument.getQuickInfoAtPosition(local.indexOf("result =")),
      ).toMatchObject({ display: "Expr<Vec3<F32>>" });

      adapter.updateDocument({
        fileName: helperFile,
        source: helper,
        version: 1,
        projectVersion: 1,
      });
      const imported = adapter.updateDocument({
        fileName: entryFile,
        source: entry,
        version: 1,
        projectVersion: 1,
      });
      expect(imported.diagnostics).toEqual([]);
      expect(
        imported.getQuickInfoAtPosition(entry.indexOf("angle(")),
      ).toMatchObject({ display: expect.stringContaining("Vec3<F32>") });

      const invalidHelper = helper.replace("atan(y, x)", "atan(y, x.x)");
      const invalid = adapter.updateDocument({
        fileName: helperFile,
        source: invalidHelper,
        version: 2,
        projectVersion: 2,
      });
      expect(
        invalid.diagnostics.filter((item) => item.source === "shdr"),
      ).toEqual([
        expect.objectContaining({
          source: "shdr",
          code: ShaderDiagnosticCode.InvalidBuiltin,
          range: {
            start: invalidHelper.indexOf("atan(y, x.x)"),
            length: "atan(y, x.x)".length,
          },
        }),
      ]);
      expect(
        invalid.diagnostics.map((item) => item.message).join("\n"),
      ).not.toContain("shdr_internal_");

      const fixed = adapter.updateDocument({
        fileName: helperFile,
        source: helper,
        version: 3,
        projectVersion: 3,
      });
      expect(fixed.diagnostics).toEqual([]);
      const refreshed = adapter.updateDocument({
        fileName: entryFile,
        source: entry,
        version: 1,
        projectVersion: 3,
      });
      expect(refreshed.diagnostics).toEqual([]);
    } finally {
      adapter.dispose();
    }
  });

  it("keeps ordinary TypeScript diagnostics separate from orbit diagnostics", () => {
    const adapter = new TypeScript7EditorAdapter({
      cwd,
      projectFileName: "tsconfig.json",
    });
    const source = `import { createFragmentShader, atan, vec4 } from "shdr";
const ordinary: string = 1;
export default createFragmentShader(({ uniforms }) => vec4(atan(uniforms.time, uniforms.time)));`;
    try {
      const document = adapter.updateDocument({
        fileName: join(cwd, "orbit-ordinary.shdr.ts"),
        source,
        version: 1,
        projectVersion: 1,
      });
      expect(document.diagnostics).toEqual([
        expect.objectContaining({ source: "typescript", code: 2322 }),
      ]);
    } finally {
      adapter.dispose();
    }
  });
});
