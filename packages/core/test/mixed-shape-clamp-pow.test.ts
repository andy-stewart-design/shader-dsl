import { expect, it } from "vitest";

import {
  lowerFragment,
  ShaderDiagnosticCode,
  type ShaderValueType,
} from "../src/index.js";

const f32: ShaderValueType = { kind: "scalar", scalar: "f32" };
const vec2: ShaderValueType = { kind: "vector", scalar: "f32", size: 2 };
const vec3: ShaderValueType = { kind: "vector", scalar: "f32", size: 3 };
const vec4: ShaderValueType = { kind: "vector", scalar: "f32", size: 4 };

function source(call: string, declarations = ""): string {
  return `import { clamp, createFragmentShader, pow, vec2, vec3, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
${declarations}
  const result = ${call};
  return coord;
});`;
}

const accepted = [
  ["clamp(v2, s, s)", vec2, [vec2, f32, f32]],
  ["clamp(v2, s, v2)", vec2, [vec2, f32, vec2]],
  ["clamp(v2, v2, s)", vec2, [vec2, vec2, f32]],
  ["pow(v2, s)", vec2, [vec2, f32]],
  ["clamp(v3, s, s)", vec3, [vec3, f32, f32]],
  ["clamp(v3, s, v3)", vec3, [vec3, f32, vec3]],
  ["clamp(v3, v3, s)", vec3, [vec3, vec3, f32]],
  ["pow(v3, s)", vec3, [vec3, f32]],
  ["clamp(v4, s, s)", vec4, [vec4, f32, f32]],
  ["clamp(v4, s, v4)", vec4, [vec4, f32, vec4]],
  ["clamp(v4, v4, s)", vec4, [vec4, vec4, f32]],
  ["pow(v4, s)", vec4, [vec4, f32]],
] as const;

it.each(accepted)(
  "lowers %s with the first argument result shape and original argument shapes",
  (call, resultType, argumentTypes) => {
    const text = source(call);
    const result = lowerFragment(text);
    expect(result.ok, call).toBe(true);
    if (!result.ok) return;

    const declaration = result.ir.statements.find(
      (statement) =>
        statement.kind === "const-declaration" && statement.name === "result",
    );
    expect(declaration?.kind).toBe("const-declaration");
    if (declaration?.kind !== "const-declaration") return;
    expect(declaration.initializer).toMatchObject({
      kind: "call",
      type: resultType,
      range: { start: text.indexOf(call), length: call.length },
    });
    if (declaration.initializer.kind !== "call") return;
    expect(
      declaration.initializer.arguments.map((argument) => argument.type),
    ).toEqual(argumentTypes);
    const argumentStarts: number[] = [];
    let argumentStart = text.indexOf(call) + call.indexOf("(") + 1;
    for (const argument of call.slice(call.indexOf("(") + 1, -1).split(", ")) {
      argumentStarts.push(argumentStart);
      argumentStart += argument.length + 2;
    }
    expect(
      declaration.initializer.arguments.map((argument) => argument.range.start),
    ).toEqual(argumentStarts);
  },
);

const invalidSignatures = [
  "clamp(s, v2, v2)",
  "clamp(v3, v2, v3)",
  "pow(s, v3)",
  "pow(v2, v3)",
  "clamp(v2, s)",
  "pow(v2, s, s)",
] as const;

it.each(invalidSignatures)(
  "rejects %s with SHDR1208 on the authored call",
  (call) => {
    const text = source(call);
    const result = lowerFragment(text);
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidBuiltin,
          range: { start: text.indexOf(call), length: call.length },
        },
      ],
    });
  },
);

const validDomains = [
  "clamp(v2, 1.0000000596046448, 1)",
  "clamp(v2, vec2(s, 1), 1)",
  "pow(vec2(s, 0), 1)",
  "pow(v2, s)",
] as const;

it.each(validDomains)(
  "does not reject unprovable or f32-valid domain %s",
  (call) => {
    expect(lowerFragment(source(call)).ok, call).toBe(true);
  },
);

const invalidDomains = [
  "clamp(v2, 2, 1)",
  "clamp(v2, vec2(s, 2), 1)",
  "pow(vec2(-1, s), 2)",
  "pow(vec2(0, s), 0)",
  "pow(vec2(10, s), 39)",
] as const;

it.each(invalidDomains)(
  "rejects locally provable domain violation %s",
  (call) => {
    const text = source(call);
    const result = lowerFragment(text);
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: ShaderDiagnosticCode.InvalidBuiltinDomain,
          range: { start: text.indexOf(call), length: call.length },
        },
      ],
    });
  },
);

it("propagates local scalar broadcasts through domain checks", () => {
  const call = "clamp(v2, lower, upper)";
  const text = source(call, "  const lower = 2;\n  const upper = 1;");
  const result = lowerFragment(text);
  expect(result).toMatchObject({
    ok: false,
    diagnostics: [
      {
        code: ShaderDiagnosticCode.InvalidBuiltinDomain,
        range: { start: text.indexOf(call), length: call.length },
      },
    ],
  });
});
