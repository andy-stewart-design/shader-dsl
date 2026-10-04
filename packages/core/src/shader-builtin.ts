import type { ShaderValueType } from "./shader-type.js";

/** Finite, target-neutral builtin identities and accepted f32 argument shapes. */
export const SHADER_BUILTINS = {
  sin: "unary-same",
  cos: "unary-same",
  ceil: "unary-same",
  smoothstep: "ternary-same",
  mix: "ternary-interpolate",
  step: "binary-step",
  abs: "unary-same",
  floor: "unary-same",
  fract: "unary-same",
  min: "binary-same",
  max: "binary-same",
  dot: "binary-vector-reduce",
  distance: "binary-reduce",
  cross: "binary-vec3",
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
    case "binary-step": {
      const x = args[1];
      return args.length === 2 && x && (sameShape(x) || first.kind === "scalar")
        ? x
        : undefined;
    }
    case "binary-vector-reduce":
      return args.length === 2 && first.kind === "vector" && sameShape(args[1])
        ? { kind: "scalar", scalar: "f32" }
        : undefined;
    case "binary-reduce":
      return args.length === 2 && sameShape(args[1])
        ? { kind: "scalar", scalar: "f32" }
        : undefined;
    case "binary-vec3":
      return args.length === 2 &&
        first.kind === "vector" &&
        first.size === 3 &&
        sameShape(args[1])
        ? first
        : undefined;
    case "ternary-same":
      return args.length === 3 && sameShape(args[1]) && sameShape(args[2])
        ? first
        : undefined;
    case "ternary-interpolate":
      return args.length === 3 &&
        sameShape(args[1]) &&
        (sameShape(args[2]) || args[2]?.kind === "scalar")
        ? first
        : undefined;
    default:
      return assertNever(SHADER_BUILTINS[name]);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported builtin signature: ${String(value)}`);
}
