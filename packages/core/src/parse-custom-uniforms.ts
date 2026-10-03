import type {
  CallExpression,
  Expression,
  Node,
  ObjectExpression,
  Program,
} from "@babel/types";
import { ShaderDiagnosticCode, type ShaderDiagnostic } from "./diagnostics.js";
import type { TextRange } from "./source-range.js";
import type {
  ShaderCustomUniformDeclaration,
  ShaderCustomUniformType,
} from "shdr";

export interface ParsedCustomUniforms {
  readonly declarations: readonly ShaderCustomUniformDeclaration[];
  readonly declarationRange: TextRange;
}
export type ParseCustomUniformsResult =
  | { readonly ok: true; readonly value: ParsedCustomUniforms }
  | { readonly ok: false; readonly diagnostics: readonly ShaderDiagnostic[] };

const TYPES = new Map<string, [ShaderCustomUniformType, number]>([
  ["f32", ["f32", 1]],
  ["vec2", ["vec2", 2]],
  ["vec3", ["vec3", 3]],
  ["vec4", ["vec4", 4]],
]);
const RESERVED = new Set([
  "resolution",
  "mouse",
  "time",
  "__proto__",
  "prototype",
  "constructor",
]);

/** Parse a literal-only declaration; never invoke user-authored JavaScript. */
export function parseCustomUniforms(
  call: CallExpression,
): ParseCustomUniformsResult {
  const argument = call.arguments[0];
  const body =
    argument?.type === "ArrowFunctionExpression" &&
    argument.body.type === "ParenthesizedExpression"
      ? argument.body.expression
      : argument?.type === "ArrowFunctionExpression"
        ? argument.body
        : undefined;
  if (
    call.callee.type !== "Identifier" ||
    call.callee.name !== "defineUniforms" ||
    call.typeArguments ||
    call.arguments.length !== 1 ||
    argument?.type !== "ArrowFunctionExpression" ||
    argument.async ||
    argument.params.length !== 1 ||
    argument.params[0]?.type !== "Identifier" ||
    argument.params[0].typeAnnotation ||
    body?.type !== "ObjectExpression" ||
    argument.returnType ||
    argument.typeParameters
  )
    return invalid(
      "defineUniforms requires a synchronous (u) => ({ ... }) declaration.",
      call,
    );

  const builder = argument.params[0].name;
  const entries: ShaderCustomUniformDeclaration[] = [];
  const seen = new Set<string>();
  for (const field of body.properties) {
    if (
      field.type !== "ObjectProperty" ||
      field.computed ||
      field.shorthand ||
      field.key.type !== "Identifier" ||
      field.value.type !== "CallExpression" ||
      field.value.typeArguments ||
      field.value.callee.type !== "MemberExpression" ||
      field.value.callee.computed ||
      field.value.callee.object.type !== "Identifier" ||
      field.value.callee.object.name !== builder ||
      field.value.callee.property.type !== "Identifier"
    )
      return invalid(
        "Custom uniforms require direct identifier keys and u.f32/u.vecN literal calls.",
        field,
      );
    const name = field.key.name;
    if (RESERVED.has(name))
      return invalid(
        `Custom uniform ${JSON.stringify(name)} conflicts with an automatic uniform.`,
        field.key,
      );
    if (seen.has(name))
      return invalid(
        `Duplicate custom uniform ${JSON.stringify(name)}.`,
        field.key,
      );
    seen.add(name);
    const entry = TYPES.get(field.value.callee.property.name);
    if (!entry)
      return invalid(
        "Only u.f32, u.vec2, u.vec3 and u.vec4 are supported.",
        field.value.callee.property,
      );
    const [type, length] = entry;
    if (field.value.arguments.length !== length)
      return invalid(
        `${field.value.callee.property.name} requires ${length} numeric literal${length === 1 ? "" : "s"}.`,
        field.value,
      );
    const values: number[] = [];
    for (const arg of field.value.arguments) {
      if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder")
        return invalid("Uniform defaults must be numeric literals.", arg);
      const value = literal(arg);
      if (
        value === undefined ||
        !Number.isFinite(value) ||
        !Number.isFinite(Math.fround(value))
      )
        return invalid(
          "Uniform defaults must be finite numeric literals without f32 overflow.",
          arg,
        );
      // JSON.stringify(-0) is 0; canonicalize for Vite/browser artifact parity.
      values.push(Object.is(value, -0) ? 0 : value);
    }
    entries.push({
      name,
      type,
      default: type === "f32" ? values[0]! : (values as [number, number]),
    });
  }
  return {
    ok: true,
    value: { declarations: entries, declarationRange: rangeOf(call) },
  };
}

function literal(node: Expression): number | undefined {
  if (node.type === "NumericLiteral") return node.value;
  if (
    node.type === "UnaryExpression" &&
    node.operator === "-" &&
    node.argument.type === "NumericLiteral"
  )
    return -node.argument.value;
  return undefined;
}

function invalid(message: string, node: Node): ParseCustomUniformsResult {
  return {
    ok: false,
    diagnostics: [
      {
        code: ShaderDiagnosticCode.InvalidCustomUniform,
        message,
        range: rangeOf(node),
        severity: "error",
      },
    ],
  };
}

function rangeOf(node: Node): TextRange {
  const start = node.start ?? 0;
  return { start, length: (node.end ?? start) - start };
}
