import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { compileFragmentArtifact } from "../src/compile-fragment-artifact.js";
import { lowerFragment } from "../src/lower-fragment.js";
import { ShaderDiagnosticCode } from "../src/diagnostics.js";

const imports = `import { createFragmentShader, defineShaderFunction, defineUniforms, vec2, vec3, vec4, fract, sqrt, exp, clamp, pow, smoothstep, step } from "shdr";
import type { Expr, F32, Vec2, Vec3, Vec4 } from "shdr";`;
function source(helpers: string, expression: string, extra = ""): string {
  return `${imports}\n${extra}\n${helpers}\nexport default createFragmentShader(({ coord, uniforms }) => ${expression});`;
}
function compile(text: string) {
  const result = compileFragmentArtifact(text);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error("Expected a compiled local helper");
  return result.artifact;
}
function reject(text: string, code: string, token: string) {
  const result = compileFragmentArtifact(text);
  expect(result.ok, text).toBe(false);
  if (result.ok) throw new Error("Expected a source diagnostic");
  expect(result.artifact).toBeUndefined();
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]?.code).toBe(code);
  const range = result.diagnostics[0]!.range;
  expect(text.slice(range.start, range.start + range.length)).toBe(token);
  return result.diagnostics[0]!;
}

const representative = source(
  `
const color = defineShaderFunction((p: Expr<Vec2<F32>>, seed: Expr<F32>): Expr<Vec4<F32>> => {
  const level = grain(p, seed);
  const rgb = palette(vec3(level));
  return vec4(rgb, 1);
});
const palette = defineShaderFunction((value: Expr<Vec3<F32>>) => value + 0.125);
const grain = defineShaderFunction((p: Expr<Vec2<F32>>, seed: Expr<F32>) => {
  const x = fract(p.x * 0.1031 + p.y * 0.11369 + seed);
  return smoothstep(0, 1, sqrt(clamp(x, 0, 1)));
});
const unused = defineShaderFunction((x: Expr<F32>) => x);`,
  "color(coord.xy, uniforms.time)",
);

describe("same-file typed shader functions", () => {
  it("never evaluates authored module code or callbacks", () => {
    compile(
      source(
        "const identity = defineShaderFunction((x: Expr<F32>) => x);",
        "vec4(identity(1))",
        'const unused = (() => { throw new Error("Authored module must not execute"); })();',
      ),
    );
    const ordinary = source(
      "",
      "vec4(1)",
      "const defineShaderFunction = () => 1; const unused = defineShaderFunction();",
    ).replace("defineShaderFunction, ", "");
    compile(ordinary);
    compile(
      source(
        "",
        "vec4(1)",
        'import { defineShaderFunction } from "./host.ts"; const unused = defineShaderFunction();',
      ).replace("defineShaderFunction, ", ""),
    );
  });

  it("deduplicates a diamond call graph and keeps each function's local scope independent", () => {
    const artifact = compile(
      source(
        `
const leaf = defineShaderFunction((x: Expr<F32>) => { const value = x + 1; return value; });
const left = defineShaderFunction((x: Expr<F32>) => { const value = leaf(x); return value; });
const right = defineShaderFunction((x: Expr<F32>) => { const value = leaf(x); return value; });
const root = defineShaderFunction((x: Expr<F32>) => left(x) + right(x));`,
        "vec4(root(uniforms.time))",
      ),
    );
    expect(artifact.glsl.match(/float shdr_internal_fn_0\(/g)).toHaveLength(1);
    expect(artifact.wgsl.match(/fn shdr_internal_fn_0\(/g)).toHaveLength(1);
    expect(artifact.glsl).toContain(
      "return shdr_internal_fn_1(x) + shdr_internal_fn_2(x);",
    );
  });

  it("lowers a forward/nested call graph, infers returns, and emits only reachable helpers once", () => {
    const lowered = lowerFragment(representative);
    expect(lowered.ok, JSON.stringify(lowered.diagnostics)).toBe(true);
    if (!lowered.ok) return;
    expect(lowered.ir.functions?.map((helper) => helper.name)).toEqual([
      "grain",
      "palette",
      "color",
    ]);
    expect(lowered.ir.functions?.map((helper) => helper.returnType)).toEqual([
      { kind: "scalar", scalar: "f32" },
      { kind: "vector", scalar: "f32", size: 3 },
      { kind: "vector", scalar: "f32", size: 4 },
    ]);
    const artifact = compile(representative);
    expect(Object.keys(artifact)).toEqual(["glsl", "wgsl", "defaults"]);
    expect(artifact.defaults).toEqual({
      glsl: ["resolution", "time"],
      wgsl: ["time"],
    });
    expect(
      artifact.glsl.match(/(?:float|vec[234]) shdr_internal_fn_\d+\(/g),
    ).toHaveLength(3);
    expect(artifact.wgsl.match(/fn shdr_internal_fn_\d+\(/g)).toHaveLength(3);
    expect(artifact.wgsl).toContain("vec3<f32>(0.125f)");
    expect(artifact.wgsl).toContain("fn shdr_internal_safe_sqrt_f32");
    expect(artifact.wgsl).toContain("fn shdr_internal_safe_clamp_f32");
    expect(artifact.wgsl).toContain("fn shdr_internal_smoothstep_f32");
    expect(artifact.glsl).not.toContain("shdr_internal_fn_3");
    expect(compile(representative)).toEqual(artifact);
    expect(JSON.parse(JSON.stringify(artifact))).toEqual(artifact);
  });

  it.each(["F32", "Vec2<F32>", "Vec3<F32>", "Vec4<F32>"])(
    "checks concrete %s inputs and inferred/annotated returns",
    (type) => {
      const value =
        type === "F32"
          ? "uniforms.time"
          : type.startsWith("Vec2")
            ? "coord.xy"
            : type.startsWith("Vec3")
              ? "coord.xyz"
              : "coord";
      const result =
        type === "F32"
          ? "vec4(identity(uniforms.time), 0, 0, 1)"
          : type.startsWith("Vec4")
            ? `identity(${value})`
            : `vec4(identity(${value}).x, 0, 0, 1)`;
      for (const annotation of ["", `: Expr<${type}>`]) {
        const text = source(
          `export const identity = defineShaderFunction((p: Expr<${type}>)${annotation} => p);`,
          result,
        );
        const artifact = compile(text);
        expect(artifact.glsl).toContain("shdr_internal_fn_0(");
        expect(artifact.wgsl).toContain("shdr_internal_fn_0(");
      }
    },
  );

  it("supports zero-argument helpers, type-only specifiers and locals with explicit dependencies", () => {
    compile(
      source(
        "const one = defineShaderFunction((): Expr<F32> => 1);",
        "vec4(one(), 0, 0, 1)",
      ),
    );
    compile(
      source(
        "const id = defineShaderFunction((coord: Expr<Vec4<F32>>) => coord);",
        "id(coord)",
      ).replace(
        "import type { Expr, F32, Vec2, Vec3, Vec4 }",
        "import { type Expr, type F32, type Vec2, type Vec3, type Vec4 }",
      ),
    );
  });

  it("keeps helper parameters dynamic, while rejecting directly invalid builtins in definitions", () => {
    reject(
      source(
        "const bad = defineShaderFunction((x: Expr<F32>) => sqrt(-1));",
        "vec4(bad(1))",
      ),
      ShaderDiagnosticCode.InvalidBuiltinDomain,
      "sqrt(-1)",
    );
    reject(
      source(
        "const bad = defineShaderFunction((x: Expr<F32>) => sqrt(vec2(x, -1)).x);",
        "vec4(bad(1))",
      ),
      ShaderDiagnosticCode.InvalidBuiltinDomain,
      "sqrt(vec2(x, -1))",
    );
    for (const value of ["-1", "uniforms.time"])
      compile(
        source(
          "const root = defineShaderFunction((x: Expr<F32>) => sqrt(x));",
          `vec4(root(${value}))`,
        ),
      );
    reject(
      source(
        "const bad = defineShaderFunction((x: Expr<F32>) => sqrt(x, x));",
        "vec4(bad(1))",
      ),
      ShaderDiagnosticCode.InvalidBuiltin,
      "sqrt(x, x)",
    );
    reject(
      source(
        "const bad = defineShaderFunction((x: Expr<F32>) => exp(1000));",
        "vec4(1)",
      ),
      ShaderDiagnosticCode.InvalidBuiltinDomain,
      "exp(1000)",
    );
  });

  it("checks literal grouping without folding or reassociating helper expressions", () => {
    const artifact = compile(
      source(
        "const f = defineShaderFunction((x: Expr<F32>, y: Expr<F32>, z: Expr<F32>) => x / (y / z));",
        "vec4(f(1, 2, 3))",
      ),
    );
    expect(artifact.glsl).toContain("return x / (y / z);");
    expect(artifact.wgsl).toContain("return x / (y / z);");
  });

  it("isolates target reserved names in helper parameters, locals and function names", () => {
    const artifact = compile(
      source(
        `const texture = defineShaderFunction((main: Expr<F32>, f32: Expr<F32>) => {
      const gl_Position = main + f32;
      const shdr_local_0 = gl_Position;
      return shdr_local_0;
    });`,
        "vec4(texture(1, 2))",
      ),
    );
    expect(artifact.glsl).toContain(
      "float shdr_internal_fn_0(float shdr_local_0, float shdr_local_1)",
    );
    expect(artifact.wgsl).toContain(
      "fn shdr_internal_fn_0(shdr_local_0: f32, shdr_local_1: f32)",
    );
    expect(artifact.glsl).not.toContain("gl_Position");
  });

  it("passes custom uniforms explicitly without changing declarations or bindings", () => {
    const text = `${imports}\nconst uniforms = defineUniforms((u) => ({ gain: u.f32(0.2) }));\nconst gain = defineShaderFunction((x: Expr<F32>) => x * 2);\nexport default createFragmentShader(({ uniforms }) => vec4(gain(uniforms.gain)), { uniforms });`;
    const artifact = compile(text);
    expect(artifact.custom).toEqual({
      declarations: [{ name: "gain", type: "f32", default: 0.2 }],
      referenced: { glsl: ["gain"], wgsl: ["gain"] },
    });
    expect(artifact.wgsl).toContain("@group(1) @binding(0)");
  });

  it.each([
    [
      "const f = defineShaderFunction((x) => x);",
      "vec4(f(1))",
      "x",
      ShaderDiagnosticCode.InvalidShaderFunction,
    ],
    [
      "const f = defineShaderFunction((x: number) => x);",
      "vec4(f(1))",
      "x: number",
      ShaderDiagnosticCode.InvalidShaderFunction,
    ],
    [
      "const f = defineShaderFunction((x: Expr<F32>): Expr<Vec2<F32>> => x);",
      "vec4(f(1).x)",
      "x",
      ShaderDiagnosticCode.InvalidReturnType,
    ],
    [
      "const f = defineShaderFunction((x: Expr<F32>) => coord.x);",
      "vec4(f(1))",
      "coord",
      ShaderDiagnosticCode.ClosureCapture,
    ],
    [
      "const f = defineShaderFunction((x: Expr<F32>) => uniforms.time);",
      "vec4(f(1))",
      "uniforms",
      ShaderDiagnosticCode.ClosureCapture,
    ],
    [
      "const f = defineShaderFunction((x: Expr<F32>) => external);",
      "vec4(f(1))",
      "external",
      ShaderDiagnosticCode.ClosureCapture,
    ],
    [
      "const f = defineShaderFunction((x: Expr<F32>) => x);",
      "vec4(f())",
      "f()",
      ShaderDiagnosticCode.InvalidShaderFunctionCall,
    ],
    [
      "const f = defineShaderFunction((x: Expr<F32>) => x);",
      "vec4(f(1, 2))",
      "f(1, 2)",
      ShaderDiagnosticCode.InvalidShaderFunctionCall,
    ],
    [
      "const f = defineShaderFunction((x: Expr<F32>) => x);",
      "vec4(f(coord.xy))",
      "f(coord.xy)",
      ShaderDiagnosticCode.InvalidShaderFunctionCall,
    ],
    [
      "const f = defineShaderFunction((x: Expr<Vec2<F32>>) => x);",
      "vec4(f(coord.xyz).x)",
      "f(coord.xyz)",
      ShaderDiagnosticCode.InvalidShaderFunctionCall,
    ],
    [
      "const f = defineShaderFunction((x: Expr<Vec3<F32>>) => x);",
      "vec4(f(coord.xy).x)",
      "f(coord.xy)",
      ShaderDiagnosticCode.InvalidShaderFunctionCall,
    ],
    [
      "const f = defineShaderFunction((x: Expr<Vec4<F32>>) => x);",
      "f(coord.xyz)",
      "f(coord.xyz)",
      ShaderDiagnosticCode.InvalidShaderFunctionCall,
    ],
    [
      "const ordinary = (x: Expr<F32>) => x;",
      "vec4(ordinary(1))",
      "ordinary(1)",
      ShaderDiagnosticCode.UnsupportedCall,
    ],
  ])(
    "rejects invalid typed boundary or call at its authored span: %s",
    (helper, expression, token, code) => {
      reject(source(helper, expression, "const external = 1;"), code, token);
    },
  );

  it("reports invalid nested calls at the call in the defining helper", () => {
    reject(
      source(
        "const scalar = defineShaderFunction((x: Expr<F32>) => x);\nconst outer = defineShaderFunction((x: Expr<Vec2<F32>>) => scalar(x));",
        "vec4(outer(coord.xy))",
      ),
      ShaderDiagnosticCode.InvalidShaderFunctionCall,
      "scalar(x)",
    );
  });

  it.each([
    [
      "const f = defineShaderFunction((x: Expr<F32>) => f(x));",
      "f(x)",
      "f → f",
    ],
    [
      "const f = defineShaderFunction((x: Expr<F32>): Expr<F32> => g(x));\nconst g = defineShaderFunction((x: Expr<F32>) => f(x));",
      "f(x)",
      "f → g → f",
    ],
  ])(
    "rejects direct/indirect recursion even with annotated returns",
    (helper, token, cycle) => {
      expect(
        reject(
          source(helper, "vec4(f(1))"),
          ShaderDiagnosticCode.RecursiveShaderFunction,
          token,
        ).message,
      ).toContain(cycle);
    },
  );

  it.each([
    "const f = defineShaderFunction(async (x: Expr<F32>) => x);",
    "let f = defineShaderFunction((x: Expr<F32>) => x);",
    "const f = defineShaderFunction((...x: Expr<F32>[]) => 1);",
    "const f = defineShaderFunction((x: Expr<F32> = 1) => x);",
    "const f = defineShaderFunction((x?: Expr<F32>) => 1);",
    "const f = defineShaderFunction(<T>(x: Expr<F32>) => x);",
    "const f = defineShaderFunction((x: Expr<F32>): number => 1);",
    "const f = defineShaderFunction((x: Expr<F32>) => { const x = 1; return x; });",
    "const f = defineShaderFunction((x: Expr<F32>) => { if (x) return x; return x; });",
    "const f = defineShaderFunction((x: Expr<F32>) => { const a = b; const b = x; return a; });",
  ])("rejects unsupported helper syntax: %s", (helper) => {
    const result = compileFragmentArtifact(source(helper, "vec4(f(1))"));
    expect(result.ok).toBe(false);
    expect(result.artifact).toBeUndefined();
  });

  it("requires imported concrete types and rejects nested marker declarations", () => {
    const text = source(
      "const f = defineShaderFunction((x: Expr<F32>) => x);",
      "vec4(f(1))",
    ).replace('import type { Expr, F32, Vec2, Vec3, Vec4 } from "shdr";', "");
    reject(text, ShaderDiagnosticCode.InvalidShaderFunction, "x: Expr<F32>");
    const nested = source(
      "function host() { const f = defineShaderFunction((x: Expr<F32>) => x); }",
      "vec4(1)",
    );
    reject(
      nested,
      ShaderDiagnosticCode.InvalidShaderFunction,
      "defineShaderFunction((x: Expr<F32>) => x)",
    );
  });

  it("compiles and links representative helpers in real WebGL 2 and compiles WGSL with a real WebGPU device", async () => {
    const artifacts = [
      compile(representative),
      compile(
        source(
          "const texture = defineShaderFunction((main: Expr<F32>, f32: Expr<F32>) => main / (f32 + 1));",
          "vec4(texture(1, 2))",
        ),
      ),
      compile(
        source(
          `
const f2 = defineShaderFunction((p: Expr<Vec2<F32>>) => sqrt(clamp(p + 1, vec2(0), vec2(4))));
const f3 = defineShaderFunction((p: Expr<Vec3<F32>>) => step(0.5, p + 0.5));
const f4 = defineShaderFunction((p: Expr<Vec4<F32>>) => pow(p, vec4(2)) + 0.1);`,
          "vec4(f2(coord.xy).x, f3(coord.xyz).x, f4(vec4(0.5)).x, 1)",
        ),
      ),
    ];
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--enable-webgl",
        "--enable-unsafe-swiftshader",
        "--enable-unsafe-webgpu",
        "--use-angle=swiftshader",
      ],
    });
    try {
      const page = await browser.newPage();
      await page.route("http://localhost/", (route) =>
        route.fulfill({ body: "<!doctype html><canvas></canvas>" }),
      );
      await page.goto("http://localhost/");
      const results = await page.evaluate(async (artifacts) => {
        const gl = document.querySelector("canvas")?.getContext("webgl2");
        if (!gl) throw new Error("WebGL 2 unavailable");
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error("WebGPU adapter unavailable");
        const device = await adapter.requestDevice();
        try {
          const vertex = gl.createShader(gl.VERTEX_SHADER)!;
          gl.shaderSource(
            vertex,
            "#version 300 es\nvoid main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }",
          );
          gl.compileShader(vertex);
          if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS))
            throw new Error(
              gl.getShaderInfoLog(vertex) ?? "Vertex compile failed",
            );
          const results = [];
          for (const artifact of artifacts) {
            const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
            gl.shaderSource(fragment, artifact.glsl);
            gl.compileShader(fragment);
            const program = gl.createProgram()!;
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            const module = device.createShaderModule({ code: artifact.wgsl });
            const info = await module.getCompilationInfo();
            results.push({
              glCompile: gl.getShaderParameter(
                fragment,
                gl.COMPILE_STATUS,
              ) as boolean,
              glLink: gl.getProgramParameter(
                program,
                gl.LINK_STATUS,
              ) as boolean,
              glLog: gl.getShaderInfoLog(fragment),
              linkLog: gl.getProgramInfoLog(program),
              wgslErrors: info.messages
                .filter((message) => message.type === "error")
                .map((message) => message.message),
            });
            gl.deleteProgram(program);
            gl.deleteShader(fragment);
          }
          gl.deleteShader(vertex);
          return results;
        } finally {
          device.destroy();
        }
      }, artifacts);
      for (const result of results) {
        expect(result.glCompile, result.glLog ?? "").toBe(true);
        expect(result.glLink, result.linkLog ?? "").toBe(true);
        expect(result.wgslErrors).toEqual([]);
      }
    } finally {
      await browser.close();
    }
  }, 30_000);
});
