import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

import {
  compileFragment,
  lowerFragment,
  ShaderDiagnosticCode,
} from "../src/index.js";
import type { ShaderBuiltinFunctionName } from "../src/index.js";

type Shape = "s" | "v2" | "v3" | "v4";
interface Example {
  readonly name: ShaderBuiltinFunctionName;
  readonly shape: Shape;
  readonly call: string;
}

const examples: Example[] = [];
for (const name of ["sin", "cos", "abs", "floor", "fract"] as const) {
  for (const shape of ["s", "v2", "v3", "v4"] as const) {
    examples.push({ name, shape, call: `${name}(${shape})` });
  }
}
for (const shape of ["s", "v2", "v3", "v4"] as const) {
  const first = shape === "s" ? "0" : `vec${shape[1]}(0)`;
  const second = shape === "s" ? "1" : `vec${shape[1]}(1)`;
  examples.push({
    name: "smoothstep",
    shape,
    call: `smoothstep(${first}, ${second}, ${shape})`,
  });
  for (const name of ["min", "max"] as const) {
    examples.push({ name, shape, call: `${name}(${shape}, ${shape})` });
  }
  examples.push({ name: "length", shape: "s", call: `length(${shape})` });
  if (shape !== "s") {
    examples.push({ name: "dot", shape: "s", call: `dot(${shape}, ${shape})` });
    examples.push({ name: "normalize", shape, call: `normalize(${shape})` });
  }
}

const names = [...new Set(examples.map((entry) => entry.name))].sort();
const imports = [...names, "createFragmentShader", "vec2", "vec3", "vec4"].join(
  ", ",
);
function source(expression: string, result: Shape): string {
  const returned =
    result === "s"
      ? `vec4(${expression}, 0, 0, 1)`
      : result === "v4"
        ? expression
        : `vec4((${expression}).x, 0, 0, 1)`;
  return `import { ${imports} } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  return ${returned};
});`;
}

function successful(
  name: string,
  result: ReturnType<typeof compileFragment>,
): asserts result is Extract<ReturnType<typeof compileFragment>, { ok: true }> {
  expect(result, name).toMatchObject({ ok: true, diagnostics: [] });
  if (!result.ok)
    throw new Error(`${name}: ${JSON.stringify(result.diagnostics)}`);
}

describe("f32 builtin matrix", () => {
  it("covers all 42 shapes and eleven finite names", () => {
    expect(examples).toHaveLength(42);
    expect(names).toEqual([
      "abs",
      "cos",
      "dot",
      "floor",
      "fract",
      "length",
      "max",
      "min",
      "normalize",
      "sin",
      "smoothstep",
    ]);
  });

  for (const { name, shape, call } of examples) {
    it(`${call} returns ${shape} in target-neutral IR and both emitters`, () => {
      for (const target of ["glsl-es-300", "wgsl"] as const) {
        const compiled = compileFragment(source(call, shape), { target });
        successful(call, compiled);
        const returned = compiled.ir.statements.at(-1);
        expect(returned?.kind).toBe("return-statement");
        expect(compiled.code).toContain(`${name}(`);
        if (target === "wgsl" && name === "smoothstep") {
          expect(compiled.code).toContain("fn shdr_internal_smoothstep_");
          expect(compiled.code).toContain(
            "return smoothstep(edge0, edge1, x);",
          );
        } else {
          expect(compiled.code).not.toContain("__shdr_internal_");
        }
        const calls = JSON.stringify(compiled.ir);
        expect(calls).toContain(`"kind":"builtin-function","name":"${name}"`);
      }
    });
  }

  for (const [call, expected] of [
    ["sin(s, s)", ShaderDiagnosticCode.InvalidBuiltin],
    ["smoothstep(0, 1, v2)", ShaderDiagnosticCode.InvalidBuiltin],
    ["smoothstep(v2, v3, v2)", ShaderDiagnosticCode.InvalidBuiltin],
    ["min(v2, s)", ShaderDiagnosticCode.InvalidBuiltin],
    ["dot(v2, v3)", ShaderDiagnosticCode.InvalidBuiltin],
    ["normalize(s)", ShaderDiagnosticCode.InvalidBuiltin],
    ["smoothstep(0, 0, s)", ShaderDiagnosticCode.InvalidBuiltinDomain],
    ["smoothstep(1, 0, s)", ShaderDiagnosticCode.InvalidBuiltinDomain],
    [
      "smoothstep(vec2(0), vec2(0, 1), v2)",
      ShaderDiagnosticCode.InvalidBuiltinDomain,
    ],
  ] as const) {
    it(`diagnoses ${call} over the original call`, () => {
      const input = source(call, "s");
      const result = lowerFragment(input);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: expected,
          range: { start: input.indexOf(call), length: call.length },
        }),
      ]);
    });
  }

  it("keeps import, call-boundary, shadowing and helper names distinct", () => {
    const unimported = source("sin(s)", "s").replace(", sin,", ",");
    expect(lowerFragment(unimported)).toMatchObject({
      ok: false,
      diagnostics: [{ code: ShaderDiagnosticCode.UnsupportedCall }],
    });
    const namespaceCall = source("Math.sin(s)", "s");
    expect(lowerFragment(namespaceCall)).toMatchObject({
      ok: false,
      diagnostics: [{ code: ShaderDiagnosticCode.UnsupportedCall }],
    });
    const shadow = source("sin(s)", "s").replace(
      "const s = uniforms.time;",
      "const sin = uniforms.time; const s = uniforms.time;",
    );
    expect(lowerFragment(shadow)).toMatchObject({
      ok: false,
      diagnostics: [{ code: ShaderDiagnosticCode.DuplicateLocal }],
    });
    const reserved = source("sin(s)", "s").replace(
      "const s = uniforms.time;",
      "const shdr_internal_smoothstep_f32 = uniforms.time; const s = uniforms.time;",
    );
    expect(lowerFragment(reserved)).toMatchObject({
      ok: false,
      diagnostics: [{ code: ShaderDiagnosticCode.ReservedIdentifier }],
    });
  });

  it("checks folded arithmetic, builtin constants and identical const expressions", () => {
    for (const call of [
      "smoothstep(0.2 + 0.3, 0.5, s)",
      "smoothstep(sin(0), 0, s)",
      "smoothstep(cos(0), 1, s)",
      "smoothstep(sin(1), sin(1), s)",
      "smoothstep(vec2(0).x, 0, s)",
    ]) {
      expect(lowerFragment(source(call, "s")), call).toMatchObject({
        ok: false,
        diagnostics: [{ code: ShaderDiagnosticCode.InvalidBuiltinDomain }],
      });
    }
    const withLocals = source("smoothstep(edge, edge + 0, s)", "s").replace(
      "const v4 = coord;",
      "const v4 = coord; const edge = 0.5;",
    );
    expect(lowerFragment(withLocals)).toMatchObject({
      ok: false,
      diagnostics: [{ code: ShaderDiagnosticCode.InvalidBuiltinDomain }],
    });
    expect(lowerFragment(source("smoothstep(s, s + 1, s)", "s")).ok).toBe(true);
  });

  it("validates generated WGSL for all 42 shapes and otherwise const-equal edges", async () => {
    const browser = await chromium.launch({
      headless: true,
      args: ["--enable-unsafe-swiftshader", "--enable-unsafe-webgpu"],
    });
    try {
      const page = await browser.newPage();
      await page.route("http://localhost/", (route) =>
        route.fulfill({ body: "<!doctype html>" }),
      );
      await page.goto("http://localhost/");
      const shaders = [
        ...examples.map(({ call, shape }) => ({ call, shape })),
        { call: "smoothstep(sin(1), sin(1 + 0), s)", shape: "s" },
        {
          call: "smoothstep(vec2(sin(1)), vec2(sin(1 + 0)), v2)",
          shape: "v2",
        },
      ].map(({ call, shape }) => {
        const compiled = compileFragment(source(call, shape as Shape), {
          target: "wgsl",
        });
        successful(call, compiled);
        return compiled.code;
      });
      const errors = await page.evaluate(async (codes) => {
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        try {
          const result: string[][] = [];
          for (const code of codes) {
            const module = device.createShaderModule({ code });
            const info = await module.getCompilationInfo();
            result.push(
              info.messages
                .filter((message) => message.type === "error")
                .map((message) => message.message),
            );
          }
          return result;
        } finally {
          device.destroy();
        }
      }, shaders);
      expect(errors).toEqual(shaders.map(() => []));
    } finally {
      await browser.close();
    }
  }, 60_000);

  it("lowers unprovable const-equal edges through a WGSL runtime-parameter helper", () => {
    const call = "smoothstep(sin(1), sin(1 + 0), s)";
    const compiled = compileFragment(source(call, "s"), { target: "wgsl" });
    successful(call, compiled);
    expect(compiled.code).toContain("fn shdr_internal_smoothstep_f32");
    expect(compiled.code).toContain(
      "shdr_internal_smoothstep_f32(sin(1.0), sin((1.0 + 0.0)), s)",
    );
  });
});
