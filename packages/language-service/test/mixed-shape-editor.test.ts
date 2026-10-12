import { lowerFragment, ShaderDiagnosticCode } from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { TypeScript7EditorAdapter } from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));

function fragmentSource(call: string): string {
  return `import { clamp, createFragmentShader, pow, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const result = ${call};
  return coord;
});`;
}

it("checks and hovers all mixed vector clamp/pow calls in a fragment", () => {
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  const examples = [
    ["clamp(v2, s, s)", "Expr<Vec2<F32>>"],
    ["clamp(v2, s, v2)", "Expr<Vec2<F32>>"],
    ["clamp(v2, v2, s)", "Expr<Vec2<F32>>"],
    ["pow(v2, s)", "Expr<Vec2<F32>>"],
    ["clamp(v3, s, s)", "Expr<Vec3<F32>>"],
    ["clamp(v3, s, v3)", "Expr<Vec3<F32>>"],
    ["clamp(v3, v3, s)", "Expr<Vec3<F32>>"],
    ["pow(v3, s)", "Expr<Vec3<F32>>"],
    ["clamp(v4, s, s)", "Expr<Vec4<F32>>"],
    ["clamp(v4, s, v4)", "Expr<Vec4<F32>>"],
    ["clamp(v4, v4, s)", "Expr<Vec4<F32>>"],
    ["pow(v4, s)", "Expr<Vec4<F32>>"],
  ] as const;
  try {
    for (const [index, [call, display]] of examples.entries()) {
      const text = fragmentSource(call);
      const document = adapter.updateDocument({
        fileName: join(cwd, `mixed-fragment-${index}.shdr.ts`),
        source: text,
        version: 1,
        projectVersion: 1,
      });
      expect(document.diagnostics, call).toEqual([]);
      expect(
        document.getQuickInfoAtPosition(text.indexOf("result =")),
        call,
      ).toMatchObject({ display });
    }
  } finally {
    adapter.dispose();
  }
});

it("refreshes unsaved mixed-shape edits and keeps diagnostics on authored calls", () => {
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  const fileName = join(cwd, "mixed-refresh.shdr.ts");
  try {
    const valid = fragmentSource("pow(v3, s)");
    const initial = adapter.updateDocument({
      fileName,
      source: valid,
      version: 1,
      projectVersion: 1,
    });
    expect(initial.diagnostics).toEqual([]);

    const invalid = fragmentSource("pow(s, v3)");
    const rejected = adapter.updateDocument({
      fileName,
      source: invalid,
      version: 2,
      projectVersion: 2,
    });
    expect(rejected.diagnostics).toEqual([
      expect.objectContaining({
        source: "shdr",
        code: ShaderDiagnosticCode.InvalidBuiltin,
        range: { start: invalid.indexOf("pow(s, v3)"), length: 10 },
      }),
    ]);
    expect(
      rejected.diagnostics.map((item) => item.message).join("\n"),
    ).not.toContain("shdr_internal_");

    const fixed = fragmentSource("clamp(v3, s, v3)");
    const refreshed = adapter.updateDocument({
      fileName,
      source: fixed,
      version: 3,
      projectVersion: 3,
    });
    expect(refreshed.diagnostics).toEqual([]);
  } finally {
    adapter.dispose();
  }
});

it("keeps local and imported defineShaderFunction mixed calls in editor parity", () => {
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  const helperFile = join(cwd, "mixed-helper.shdr.ts");
  const entryFile = join(cwd, "mixed-entry.shdr.ts");
  const helper = `import { clamp, defineShaderFunction, pow, vec3 } from "shdr";
import type { Expr, F32, Vec3 } from "shdr";
export const mixed = defineShaderFunction((value: Expr<Vec3<F32>>, exponent: Expr<F32>) =>
  pow(clamp(value, exponent, vec3(exponent)), exponent)
);`;
  const entry = `import { createFragmentShader, vec4 } from "shdr";
import { mixed } from "./mixed-helper.shdr.ts";
export default createFragmentShader(({ coord, uniforms }) => {
  const result = mixed(coord.xyz, uniforms.time);
  return coord;
});`;
  try {
    const local = `import { clamp, createFragmentShader, defineShaderFunction, pow, vec3, vec4 } from "shdr";
import type { Expr, F32, Vec3 } from "shdr";
const mixed = defineShaderFunction((value: Expr<Vec3<F32>>, exponent: Expr<F32>) =>
  pow(clamp(value, exponent, vec3(exponent)), exponent)
);
export default createFragmentShader(({ coord, uniforms }) => {
  const result = mixed(coord.xyz, uniforms.time);
  return coord;
});`;
    const localDocument = adapter.updateDocument({
      fileName: join(cwd, "mixed-local.shdr.ts"),
      source: local,
      version: 1,
      projectVersion: 1,
    });
    expect(localDocument.diagnostics).toEqual([]);
    expect(
      localDocument.getQuickInfoAtPosition(local.indexOf("result =")),
    ).toMatchObject({
      display: "Expr<Vec3<F32>>",
    });

    adapter.updateDocument({
      fileName: helperFile,
      source: helper,
      version: 1,
      projectVersion: 1,
    });
    const importedDocument = adapter.updateDocument({
      fileName: entryFile,
      source: entry,
      version: 1,
      projectVersion: 1,
    });
    expect(importedDocument.diagnostics).toEqual([]);
    expect(
      importedDocument.getQuickInfoAtPosition(entry.indexOf("mixed(")),
    ).toMatchObject({ display: expect.stringContaining("Expr<Vec3<F32>>") });

    const badHelper = helper.replace(
      "clamp(value, exponent, vec3(exponent))",
      "clamp(exponent, value, value)",
    );
    const changedHelper = adapter.updateDocument({
      fileName: helperFile,
      source: badHelper,
      version: 2,
      projectVersion: 2,
    });
    expect(
      changedHelper.diagnostics.filter((item) => item.source === "shdr"),
    ).toEqual([
      expect.objectContaining({
        source: "shdr",
        code: ShaderDiagnosticCode.InvalidBuiltin,
        range: {
          start: badHelper.indexOf("clamp(exponent, value, value)"),
          length: "clamp(exponent, value, value)".length,
        },
      }),
    ]);
    expect(
      changedHelper.diagnostics.map((item) => item.message).join("\n"),
    ).not.toContain("shdr_internal_");
  } finally {
    adapter.dispose();
  }
});

it("matches core domain diagnostics for scalar broadcasts", () => {
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  const call = "clamp(v2, 2, 1)";
  const text = fragmentSource(call);
  try {
    const lowered = lowerFragment(text);
    expect(lowered).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidBuiltinDomain,
          range: { start: text.indexOf(call), length: call.length },
        },
      ],
    });
    const document = adapter.updateDocument({
      fileName: join(cwd, "mixed-domain.shdr.ts"),
      source: text,
      version: 1,
      projectVersion: 1,
    });
    expect(
      document.diagnostics.filter((item) => item.source === "shdr"),
    ).toEqual([
      expect.objectContaining({
        source: "shdr",
        code: ShaderDiagnosticCode.InvalidBuiltinDomain,
        range: { start: text.indexOf(call), length: call.length },
      }),
    ]);
  } finally {
    adapter.dispose();
  }
});
