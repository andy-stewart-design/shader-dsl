import { lowerFragment, ShaderDiagnosticCode } from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { TypeScript7EditorAdapter } from "../src/index.js";

const cwd = fileURLToPath(new URL("fixtures/project/", import.meta.url));
const fileName = join(cwd, "mix-step.shdr.ts");

const cases = [
  ["mix(s, s, s)", "Expr<F32>"],
  ["step(s, s)", "Expr<F32>"],
  ...([2, 3, 4] as const).flatMap((size) => [
    [`mix(v${size}, v${size}, s)`, `Expr<Vec${size}<F32>>`],
    [`mix(v${size}, v${size}, v${size})`, `Expr<Vec${size}<F32>>`],
    [`step(v${size}, v${size})`, `Expr<Vec${size}<F32>>`],
    [`step(s, v${size})`, `Expr<Vec${size}<F32>>`],
  ]),
] as const;
function source(call: string): string {
  return `import { createFragmentShader, mix, step, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const result = ${call};
  return coord;
});`;
}

it("refreshes QuickInfo when an existing file changes from scalar to vector mix", () => {
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    for (const [index, [call, expected]] of (
      [
        ["mix(s, s, s)", "Expr<F32>"],
        ["mix(v2, v2, s)", "Expr<Vec2<F32>>"],
      ] as const
    ).entries()) {
      const text = source(call);
      const document = adapter.updateDocument({
        fileName,
        source: text,
        version: index + 1,
        projectVersion: 1,
      });
      expect(document.diagnostics, call).toEqual([]);
      expect(
        document.getQuickInfoAtPosition(text.indexOf("result =")),
        call,
      ).toMatchObject({ display: expected });
    }
  } finally {
    adapter.dispose();
  }
});

it("matches core and TypeScript 7 quick-info for all 14 mix/step signatures", () => {
  expect(cases).toHaveLength(14);
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    for (const [index, [call, expected]] of cases.entries()) {
      const text = source(call);
      const document = adapter.updateDocument({
        fileName: join(cwd, `mix-step-positive-${index}.shdr.ts`),
        source: text,
        version: 1,
        projectVersion: 1,
      });
      expect(lowerFragment(text).ok, call).toBe(true);
      expect(document.diagnostics, call).toEqual([]);
      expect(
        document.getQuickInfoAtPosition(text.indexOf("result =")),
        call,
      ).toMatchObject({ display: expected });
    }
  } finally {
    adapter.dispose();
  }
});

it("does not cascade TypeScript overload errors through an invalid mix local", () => {
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  const call = "mix(v3, v3, v2)";
  const text = source(call)
    .replace("export default", "const ordinary: string = 1;\nexport default")
    .replace("return coord;", "return vec4(result, 1);");
  try {
    const lowered = lowerFragment(text);
    expect(lowered.ok).toBe(false);
    if (lowered.ok) return;
    const document = adapter.updateDocument({
      fileName: join(cwd, "mix-step-cascade.shdr.ts"),
      source: text,
      version: 1,
      projectVersion: 1,
    });
    expect(document.diagnostics).toEqual([
      expect.objectContaining({ source: "typescript", code: 2322 }),
      expect.objectContaining({
        source: "shdr",
        code: ShaderDiagnosticCode.InvalidBuiltin,
        range: { start: text.indexOf(call), length: call.length },
      }),
    ]);
  } finally {
    adapter.dispose();
  }
});

it("preserves mix/step import and unsupported-call boundaries in TypeScript 7", () => {
  const boundaryCases = [
    {
      text: source("mix(s, s, s)").replace("mix, step,", "step,"),
      code: ShaderDiagnosticCode.UnsupportedCall,
      token: "mix(s, s, s)",
    },
    {
      text: source("step(s, s)").replace("mix, step,", "mix,"),
      code: ShaderDiagnosticCode.UnsupportedCall,
      token: "step(s, s)",
    },
    {
      text: source("mix(s, s, s)").replace(
        "mix, step,",
        "mix as interpolate, step,",
      ),
      code: ShaderDiagnosticCode.ImportAlias,
      token: "mix as interpolate",
    },
    {
      text: source("step(s, s)").replace(
        "mix, step,",
        "mix, step as threshold,",
      ),
      code: ShaderDiagnosticCode.ImportAlias,
      token: "step as threshold",
    },
  ];
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    for (const [index, { text, code, token }] of boundaryCases.entries()) {
      const lowered = lowerFragment(text);
      expect(lowered.ok, token).toBe(false);
      if (lowered.ok) continue;
      expect(lowered.diagnostics, token).toHaveLength(1);
      expect(lowered.diagnostics[0]!.code, token).toBe(code);
      const document = adapter.updateDocument({
        fileName: join(cwd, `mix-step-boundary-${index}.shdr.ts`),
        source: text,
        version: 1,
        projectVersion: 1,
      });
      expect(
        document.diagnostics.filter(
          (diagnostic) => diagnostic.source === "shdr",
        ),
        token,
      ).toEqual([
        expect.objectContaining({
          code,
          range: lowered.diagnostics[0]!.range,
          message: lowered.diagnostics[0]!.message,
        }),
      ]);
      const range = lowered.diagnostics[0]!.range;
      expect(text.slice(range.start, range.start + range.length), token).toBe(
        token,
      );
    }
  } finally {
    adapter.dispose();
  }
});

it("reports bad arity, mixed shapes and nested call failures on authored calls", () => {
  const adapter = new TypeScript7EditorAdapter({
    cwd,
    projectFileName: "tsconfig.json",
  });
  try {
    for (const [index, call] of [
      "mix(s, s)",
      "mix(v2, v3, s)",
      "mix(v3, v3, v2)",
      "step(v2, s)",
      "step(v2, v3)",
      "mix(v2, v2, step(v3, s))",
    ].entries()) {
      const text = source(call);
      const lowered = lowerFragment(text);
      expect(lowered.ok, call).toBe(false);
      if (lowered.ok) continue;
      const document = adapter.updateDocument({
        fileName,
        source: text,
        version: index + 1,
        projectVersion: 1,
      });
      expect(
        document.diagnostics.filter(
          (diagnostic) => diagnostic.source === "shdr",
        ),
        call,
      ).toEqual([
        expect.objectContaining({
          code: ShaderDiagnosticCode.InvalidBuiltin,
          message: lowered.diagnostics[0]!.message,
          range: lowered.diagnostics[0]!.range,
        }),
      ]);
      expect(
        document.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
        call,
      ).not.toMatch(/__shdr_internal_/);
    }
  } finally {
    adapter.dispose();
  }
});
