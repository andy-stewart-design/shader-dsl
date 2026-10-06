import { chromium } from "playwright";
import { expect, it } from "vitest";
import { compileFragmentArtifact } from "../src/compile-fragment-artifact.js";
import { generateGlslExpression } from "../src/generate-glsl-expression.js";
import { generateWgslExpression } from "../src/generate-wgsl-expression.js";
import type { ShaderExpression } from "../src/shader-ir.js";
import type { ShaderBinaryOperator } from "../src/shader-operator.js";

const range = { start: 0, length: 1 };
const f32 = { kind: "scalar", scalar: "f32" } as const;
const vec2 = { kind: "vector", scalar: "f32", size: 2 } as const;
const local = (name: string, symbolId: number): ShaderExpression => ({
  kind: "local-reference",
  name,
  symbolId,
  type: f32,
  range,
});
const a = local("a", 0);
const b = local("b", 1);
const c = local("c", 2);
const numeric = (value: number): ShaderExpression => ({
  kind: "numeric-literal",
  value,
  type: f32,
  range,
});
const binary = (
  operator: ShaderBinaryOperator,
  left: ShaderExpression,
  right: ShaderExpression,
  type: ShaderExpression["type"] = f32,
): ShaderExpression => ({ kind: "binary", operator, left, right, type, range });
const unary = (argument: ShaderExpression): ShaderExpression => ({
  kind: "unary",
  operator: "-",
  argument,
  type: argument.type,
  range,
});
const vector = (
  left: ShaderExpression,
  right: ShaderExpression,
): ShaderExpression => ({
  kind: "call",
  target: { kind: "constructor", name: "vec2" },
  arguments: [left, right],
  type: vec2,
  range,
});
const x = (expression: ShaderExpression): ShaderExpression => ({
  kind: "swizzle",
  expression,
  components: [0],
  type: f32,
  range,
});

it.each([
  [
    binary("+", a, binary("*", b, c)),
    "shdr_local_0 + shdr_local_1 * shdr_local_2",
  ],
  [
    binary("*", binary("+", a, b), c),
    "(shdr_local_0 + shdr_local_1) * shdr_local_2",
  ],
  [
    binary("+", binary("*", a, b), c),
    "shdr_local_0 * shdr_local_1 + shdr_local_2",
  ],
  [
    binary("+", a, binary("+", b, c)),
    "shdr_local_0 + (shdr_local_1 + shdr_local_2)",
  ],
  [
    binary("-", a, binary("-", b, c)),
    "shdr_local_0 - (shdr_local_1 - shdr_local_2)",
  ],
  [
    binary("*", a, binary("*", b, c)),
    "shdr_local_0 * (shdr_local_1 * shdr_local_2)",
  ],
  [
    binary("/", a, binary("/", b, c)),
    "shdr_local_0 / (shdr_local_1 / shdr_local_2)",
  ],
  [
    binary("*", a, binary("/", b, c)),
    "shdr_local_0 * (shdr_local_1 / shdr_local_2)",
  ],
  [
    binary("+", binary("+", a, b), c),
    "shdr_local_0 + shdr_local_1 + shdr_local_2",
  ],
  [
    binary("/", binary("*", a, b), c),
    "shdr_local_0 * shdr_local_1 / shdr_local_2",
  ],
  [unary(unary(a)), "-(-shdr_local_0)"],
  [unary(numeric(-1)), "-(-1.0)"],
  [unary(binary("+", a, b)), "-(shdr_local_0 + shdr_local_1)"],
  [binary("*", unary(a), b), "-shdr_local_0 * shdr_local_1"],
  [x(vector(a, b)), "vec2(shdr_local_0, shdr_local_1).x"],
  [
    x(binary("+", vector(a, b), vector(b, c), vec2)),
    "(vec2(shdr_local_0, shdr_local_1) + vec2(shdr_local_1, shdr_local_2)).x",
  ],
  [x(unary(vector(a, b))), "(-vec2(shdr_local_0, shdr_local_1)).x"],
] as const)("preserves exact IR grouping for %s", (expression, glsl) => {
  expect(generateGlslExpression(expression).code).toBe(glsl);
  expect(generateWgslExpression(expression).code).toBe(
    glsl.replaceAll("vec2(", "vec2<f32>(").replaceAll("1.0", "1.0f"),
  );
});

it("retains WGSL scalar splats and helper calls with readable arguments", () => {
  const combined = binary("+", vector(a, b), binary("*", b, c), vec2);
  expect(generateGlslExpression(combined).code).toBe(
    "vec2(shdr_local_0, shdr_local_1) + shdr_local_1 * shdr_local_2",
  );
  expect(generateWgslExpression(combined).code).toBe(
    "vec2<f32>(shdr_local_0, shdr_local_1) + vec2<f32>(shdr_local_1 * shdr_local_2)",
  );
  const nestedScalar = binary("+", vector(a, b), binary("+", b, c), vec2);
  expect(generateWgslExpression(nestedScalar).code).toBe(
    "vec2<f32>(shdr_local_0, shdr_local_1) + vec2<f32>(shdr_local_1 + shdr_local_2)",
  );
  const smooth: ShaderExpression = {
    kind: "call",
    target: { kind: "builtin-function", name: "smoothstep" },
    arguments: [
      vector(numeric(0), numeric(0)),
      vector(numeric(1), numeric(1)),
      combined,
    ],
    type: vec2,
    range,
  };
  expect(generateWgslExpression(smooth)).toMatchObject({
    code: "shdr_internal_smoothstep_vec2(vec2<f32>(0.0f, 0.0f), vec2<f32>(1.0f, 1.0f), vec2<f32>(shdr_local_0, shdr_local_1) + vec2<f32>(shdr_local_1 * shdr_local_2))",
    smoothstepShapes: ["vec2"],
  });
});

it("compiles grouped source expressions, vector splats, swizzle receivers and guards in both targets", async () => {
  const source = `import { createFragmentShader, sqrt, vec2, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const a = coord.x;
  const b = uniforms.time;
  const c = coord.y;
  const shifted = vec2(a, c) + b * 0.25;
  const selected = (shifted + vec2(b, c)).xy.yx;
  const reflected = (-shifted).yx;
  const doubleNeg = -(-b);
  return vec4(a + (b + c), a * (b * c), sqrt(selected.x * selected.x + reflected.x * reflected.x + doubleNeg * doubleNeg + 1), 1);
});`;
  const result = compileFragmentArtifact(source);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.artifact.glsl).toContain("a + (b + c)");
  expect(result.artifact.wgsl).toContain("a + (b + c)");
  expect(result.artifact.glsl).toContain("(shifted + vec2(b, c)).xy.yx");
  expect(result.artifact.wgsl).toContain("(shifted + vec2<f32>(b, c)).xy.yx");
  expect(result.artifact.wgsl).toContain(
    "let reflected: vec2<f32> = (-shifted).yx;",
  );
  expect(result.artifact.wgsl).toContain("let doubleNeg: f32 = -(-b);");
  expect(result.artifact.wgsl).toContain("shdr_internal_safe_sqrt_f32(");
  const modules = [result.artifact];
  for (const size of [2, 3, 4] as const) {
    const value = size === 2 ? "coord.xy" : size === 3 ? "coord.xyz" : "coord";
    const returned =
      size === 2
        ? "vec4(combined + scaled, 0, 1)"
        : size === 3
          ? "vec4(combined + scaled, 1)"
          : "combined + scaled";
    const compiled =
      compileFragmentArtifact(`import { createFragmentShader, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const v = ${value};
  const combined = v + (v + v);
  const scaled = v * (v + uniforms.time);
  return ${returned};
});`);
    expect(
      compiled.ok,
      `V${size}: ${JSON.stringify(compiled.diagnostics)}`,
    ).toBe(true);
    if (!compiled.ok) continue;
    expect(compiled.artifact.glsl).toContain("v + (v + v)");
    expect(compiled.artifact.wgsl).toContain("v + (v + v)");
    expect(compiled.artifact.wgsl).toContain(
      `v * (v + vec${size}<f32>(shdr_time))`,
    );
    modules.push(compiled.artifact);
  }
  expect(modules).toHaveLength(4);
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
    const errors = await page.evaluate(async (samples) => {
      const gl = document.querySelector("canvas")!.getContext("webgl2")!;
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw Error("WebGPU unavailable");
      const device = await adapter.requestDevice();
      try {
        const output = [];
        for (const { glsl, wgsl } of samples) {
          const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
          gl.shaderSource(shader, glsl);
          gl.compileShader(shader);
          const glslError = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
            ? null
            : gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          const info = await device
            .createShaderModule({ code: wgsl })
            .getCompilationInfo();
          output.push({
            glslError,
            wgslErrors: info.messages
              .filter((m) => m.type === "error")
              .map((m) => m.message),
          });
        }
        return output;
      } finally {
        device.destroy();
      }
    }, modules);
    expect(errors).toEqual(
      modules.map(() => ({ glslError: null, wgslErrors: [] })),
    );
  } finally {
    await browser.close();
  }
}, 60_000);
