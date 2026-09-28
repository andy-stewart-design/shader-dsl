import type { ShaderValueType } from "./shader-type.js";

/** Finite, target-neutral builtin identities and accepted f32 argument shapes. */
export const SHADER_BUILTINS = {
  sin: "unary-same",
  cos: "unary-same",
  smoothstep: "ternary-same",
  abs: "unary-same",
  floor: "unary-same",
  fract: "unary-same",
  min: "binary-same",
  max: "binary-same",
  dot: "binary-vector-reduce",
  length: "unary-reduce",
  normalize: "unary-vector",
} as const;

export type ShaderBuiltinFunctionName = keyof typeof SHADER_BUILTINS;

export function isShaderBuiltinName(
  name: string,
): name is ShaderBuiltinFunctionName {
  return Object.hasOwn(SHADER_BUILTINS, name);
}

export function builtinResultType(
  name: ShaderBuiltinFunctionName,
  args: readonly ShaderValueType[],
): ShaderValueType | undefined {
  const first = args[0];
  if (!first) return undefined;
  const sameShape = (other: ShaderValueType | undefined): boolean =>
    other !== undefined &&
    first.kind === other.kind &&
    (first.kind === "scalar" ||
      (other.kind === "vector" && first.size === other.size));
  switch (SHADER_BUILTINS[name]) {
    case "unary-same":
      return args.length === 1 ? first : undefined;
    case "unary-vector":
      return args.length === 1 && first.kind === "vector" ? first : undefined;
    case "unary-reduce":
      return args.length === 1 ? { kind: "scalar", scalar: "f32" } : undefined;
    case "binary-same":
      return args.length === 2 && sameShape(args[1]) ? first : undefined;
    case "binary-vector-reduce":
      return args.length === 2 && first.kind === "vector" && sameShape(args[1])
        ? { kind: "scalar", scalar: "f32" }
        : undefined;
    case "ternary-same":
      return args.length === 3 && sameShape(args[1]) && sameShape(args[2])
        ? first
        : undefined;
    default:
      return assertNever(SHADER_BUILTINS[name]);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported builtin signature: ${String(value)}`);
}
