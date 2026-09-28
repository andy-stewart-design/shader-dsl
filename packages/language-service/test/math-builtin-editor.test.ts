import { lowerFragment, ShaderDiagnosticCode } from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TypeScript7EditorAdapter } from "../src/index.js";

const projectDirectory = fileURLToPath(
  new URL("fixtures/project/", import.meta.url),
);
const fileName = join(projectDirectory, "gradient.shdr.ts");

function source(expression: string): string {
  return `import { createFragmentShader, vec2, vec4, sin, cos, smoothstep, length } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy;
  const wave = cos(uv);
  const edge = smoothstep(vec2(0), vec2(1), wave);
  const magnitude = length(-1);
  const value = ${expression};
  return vec4(value, edge.x, magnitude, 1);
});`;
}

describe("builtin calls in the shared TypeScript 7 editor adapter", () => {
  it("provides scalar/vector hovers and no diagnostics for valid calls", () => {
    const adapter = new TypeScript7EditorAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    const text = source("sin(uniforms.time)");
    try {
      const document = adapter.updateDocument({
        fileName,
        source: text,
        version: 1,
        projectVersion: 1,
      });
      expect(document.diagnostics).toEqual([]);
      expect(
        document.getQuickInfoAtPosition(text.indexOf("edge.x")),
      ).toMatchObject({ display: "Expr<Vec2<F32>>" });
      expect(
        document.getQuickInfoAtPosition(text.indexOf("magnitude, 1")),
      ).toMatchObject({ display: "Expr<F32>" });
      expect(
        document.getQuickInfoAtPosition(text.indexOf("value,")),
      ).toMatchObject({ display: "Expr<F32>" });
    } finally {
      adapter.dispose();
    }
  });

  it("accepts reversed scalar and mixed-order vector edges in the editor", () => {
    const adapter = new TypeScript7EditorAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    try {
      for (const [index, expression] of [
        "smoothstep(0.8, 0.2, uniforms.time)",
        "smoothstep(vec2(0.8, 0.2), vec2(0.2, 0.8), uv).x",
      ].entries()) {
        const text = source(expression);
        const document = adapter.updateDocument({
          fileName,
          source: text,
          version: index + 1,
          projectVersion: 1,
        });
        expect(document.diagnostics, expression).toEqual([]);
        expect(
          document.getQuickInfoAtPosition(text.indexOf("value,")),
        ).toMatchObject({
          display: "Expr<F32>",
        });
      }
    } finally {
      adapter.dispose();
    }
  });

  it("checks and hovers all 42 f32 signatures through the shared adapter", () => {
    const adapter = new TypeScript7EditorAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    const examples: { call: string; result: string }[] = [];
    for (const name of ["sin", "cos", "abs", "floor", "fract"] as const) {
      for (const shape of ["s", "v2", "v3", "v4"] as const) {
        examples.push({ call: `${name}(${shape})`, result: shape });
      }
    }
    for (const shape of ["s", "v2", "v3", "v4"] as const) {
      const first = shape === "s" ? "0" : `vec${shape[1]}(0)`;
      const second = shape === "s" ? "1" : `vec${shape[1]}(1)`;
      examples.push({
        call: `smoothstep(${first}, ${second}, ${shape})`,
        result: shape,
      });
      for (const name of ["min", "max"] as const) {
        examples.push({ call: `${name}(${shape}, ${shape})`, result: shape });
      }
      examples.push({ call: `length(${shape})`, result: "s" });
      if (shape !== "s") {
        examples.push({ call: `dot(${shape}, ${shape})`, result: "s" });
        examples.push({ call: `normalize(${shape})`, result: shape });
      }
    }
    expect(examples).toHaveLength(42);
    try {
      for (const [index, { call, result }] of examples.entries()) {
        const returned =
          result === "v4"
            ? "result"
            : `vec4(${result === "s" ? "result" : "result.x"}, 0, 0, 1)`;
        const text = `import { createFragmentShader, vec2, vec3, vec4, sin, cos, smoothstep, abs, floor, fract, min, max, dot, length, normalize } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const result = ${call};
  return ${returned};
});`;
        const document = adapter.updateDocument({
          fileName,
          source: text,
          version: index,
          projectVersion: 1,
        });
        expect(document.diagnostics, call).toEqual([]);
        const display =
          result === "s" ? "Expr<F32>" : `Expr<Vec${result[1]}<F32>>`;
        expect(
          document.getQuickInfoAtPosition(text.indexOf("result =")),
          call,
        ).toMatchObject({ display });
      }
    } finally {
      adapter.dispose();
    }
  });

  it("keeps a more specific invalid inner-argument diagnostic", () => {
    const adapter = new TypeScript7EditorAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    const text = source("abs(uniforms)").replace(
      "sin, cos, smoothstep, length",
      "sin, cos, smoothstep, length, abs",
    );
    try {
      const document = adapter.updateDocument({
        fileName,
        source: text,
        version: 1,
        projectVersion: 1,
      });
      expect(document.diagnostics).toEqual([
        expect.objectContaining({
          code: ShaderDiagnosticCode.InvalidUniform,
          range: {
            start: text.indexOf("uniforms)"),
            length: "uniforms".length,
          },
        }),
      ]);
    } finally {
      adapter.dispose();
    }
  });

  for (const [expression, code] of [
    ["sin(uv, 1)", ShaderDiagnosticCode.InvalidBuiltin],
    [
      "smoothstep(0, 0, uniforms.time)",
      ShaderDiagnosticCode.InvalidBuiltinDomain,
    ],
    [
      "smoothstep(vec2(0), vec2(0, 1), uv).x",
      ShaderDiagnosticCode.InvalidBuiltinDomain,
    ],
  ] as const) {
    it(`reports ${code} over ${expression} without TS overload cascades`, () => {
      const adapter = new TypeScript7EditorAdapter({
        cwd: projectDirectory,
        projectFileName: "tsconfig.json",
      });
      const text = source(expression);
      const call = expression.endsWith(".x")
        ? expression.slice(0, -2)
        : expression;
      try {
        const document = adapter.updateDocument({
          fileName,
          source: text,
          version: 1,
          projectVersion: 1,
        });
        expect(document.diagnostics).toEqual([
          expect.objectContaining({
            code,
            source: "shdr",
            range: { start: text.indexOf(call), length: call.length },
          }),
        ]);
        expect(
          document.getQuickInfoAtPosition(text.indexOf(call) + 1),
        ).toBeUndefined();
      } finally {
        adapter.dispose();
      }
    });
  }

  it("preserves import and unsupported-call ownership for aliases, namespaces and captures", () => {
    const cases = [
      {
        text: source("sin(uniforms.time)").replace(
          "sin, cos",
          "sin as sine, cos",
        ),
        code: ShaderDiagnosticCode.ImportAlias,
        token: "sin as sine",
      },
      {
        text: `import * as shaderMath from "shdr";\n${source("sin(uniforms.time)")}`,
        code: ShaderDiagnosticCode.NamespaceImport,
        token: "* as shaderMath",
      },
      {
        text: source("sin(uniforms.time)").replace("sin, cos", "cos"),
        code: ShaderDiagnosticCode.UnsupportedCall,
        token: "sin(uniforms.time)",
      },
      {
        text: `import { sin } from "./ordinary.js";\n${source("sin(uniforms.time)").replace("sin, cos", "cos")}`,
        code: ShaderDiagnosticCode.UnsupportedCall,
        token: "sin(uniforms.time)",
      },
      {
        text: `import { mix } from "shdr";\n${source("sin(uniforms.time)")}`,
        code: ShaderDiagnosticCode.UnsupportedShdrImport,
        token: "mix",
      },
      {
        text: `const captured = 1;\n${source("sin(captured)")}`,
        code: ShaderDiagnosticCode.ClosureCapture,
        token: "captured)",
      },
      {
        text: source("Math.sin(uniforms.time)"),
        code: ShaderDiagnosticCode.UnsupportedCall,
        token: "Math.sin(uniforms.time)",
      },
    ];
    const adapter = new TypeScript7EditorAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    try {
      for (const [index, { text, code, token }] of cases.entries()) {
        const lowered = lowerFragment(text);
        expect(lowered.ok, token).toBe(false);
        if (lowered.ok) continue;
        expect(lowered.diagnostics, token).toHaveLength(1);
        expect(lowered.diagnostics[0]?.code, token).toBe(code);
        const document = adapter.updateDocument({
          fileName,
          source: text,
          version: index + 1,
          projectVersion: 1,
        });
        if (text.includes("./ordinary.js") || text.includes("import { mix }")) {
          expect(document.diagnostics, token).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ source: "typescript", code: 2305 }),
            ]),
          );
        }
        const shaderDiagnostics = document.diagnostics.filter(
          (diagnostic) => diagnostic.source === "shdr",
        );
        expect(shaderDiagnostics, token).toEqual([
          expect.objectContaining({
            code,
            range: lowered.diagnostics[0]!.range,
            message: lowered.diagnostics[0]!.message,
          }),
        ]);
        expect(
          text.slice(
            shaderDiagnostics[0]!.range.start,
            shaderDiagnostics[0]!.range.start +
              shaderDiagnostics[0]!.range.length,
          ),
          token,
        ).toContain(token.replace(/\)$/, ""));
      }
    } finally {
      adapter.dispose();
    }
  });

  it("reports a shadowed imported builtin on its local declaration name", () => {
    const text = source("sin(uniforms.time)").replace(
      "const uv = coord.xy;",
      "const sin = uniforms.time;\n  const uv = coord.xy;",
    );
    const lowered = lowerFragment(text);
    expect(lowered).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.DuplicateLocal,
          range: { start: text.indexOf("const sin") + 6, length: 3 },
        },
      ],
    });
    const adapter = new TypeScript7EditorAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    try {
      const document = adapter.updateDocument({
        fileName,
        source: text,
        version: 1,
        projectVersion: 1,
      });
      expect(document.diagnostics).toEqual([
        expect.objectContaining({
          code: ShaderDiagnosticCode.DuplicateLocal,
          source: "shdr",
          range: { start: text.indexOf("const sin") + 6, length: 3 },
        }),
      ]);
    } finally {
      adapter.dispose();
    }
  });

  it("agrees with core on rejected arity, shape, nested calls and domain ranges", () => {
    const adapter = new TypeScript7EditorAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    const failures = [
      "sin(uv, 1)",
      "cos()",
      "smoothstep(0, 1, uv)",
      "smoothstep(uv, coord.xyz, uv)",
      "abs(uv, uv)",
      "floor()",
      "fract(uv, 1)",
      "min(uv, 1)",
      "max(1, uv)",
      "dot(uv, coord.xyz)",
      "length(uv, uv)",
      "normalize(1)",
      "abs(dot(uv, coord.xyz))",
      "smoothstep(0, 0, uniforms.time)",
      "smoothstep(vec2(0), vec2(0, 1), uv).x",
    ];
    try {
      for (const [index, expression] of failures.entries()) {
        const text = source(expression).replace(
          "sin, cos, smoothstep, length",
          "sin, cos, smoothstep, length, abs, floor, fract, min, max, dot, normalize",
        );
        const lowered = lowerFragment(text);
        expect(lowered.ok, expression).toBe(false);
        if (lowered.ok) continue;
        const document = adapter.updateDocument({
          fileName,
          source: text,
          version: index + 1,
          projectVersion: 1,
        });
        expect(
          document.diagnostics.map(({ code, message, range, source }) => ({
            code,
            message,
            range,
            source,
          })),
          expression,
        ).toEqual(
          lowered.diagnostics.map(({ code, message, range }) => ({
            code,
            message,
            range,
            source: "shdr",
          })),
        );
        expect(document.diagnostics[0]?.message, expression).not.toMatch(
          /__shdr_internal_|shdr_internal_smoothstep/,
        );
      }
    } finally {
      adapter.dispose();
    }
  });
});
