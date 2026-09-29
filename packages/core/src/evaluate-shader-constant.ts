import type { ShaderExpression, ShaderLocalSymbolId } from "./shader-ir.js";

/** Only values whose f32 components can be established without target-dependent math. */
export function evaluateShaderConstant(
  expression: ShaderExpression,
  locals: ReadonlyMap<ShaderLocalSymbolId, readonly number[]>,
): readonly number[] | undefined {
  switch (expression.kind) {
    case "numeric-literal":
      return [Math.fround(expression.value)];
    case "local-reference":
      return locals.get(expression.symbolId);
    case "unary": {
      const arg = evaluateShaderConstant(expression.argument, locals);
      return arg?.map((value) => Math.fround(-value));
    }
    case "binary": {
      const left = evaluateShaderConstant(expression.left, locals);
      const right = evaluateShaderConstant(expression.right, locals);
      if (!left || !right) return undefined;
      if (left.length !== right.length && right.length !== 1) return undefined;
      return left.map((value, index) => {
        const other = right[right.length === 1 ? 0 : index]!;
        switch (expression.operator) {
          case "+":
            return Math.fround(value + other);
          case "-":
            return Math.fround(value - other);
          case "*":
            return Math.fround(value * other);
          case "/":
            return Math.fround(value / other);
          default:
            throw new Error("Unsupported constant binary operator.");
        }
      });
    }
    case "swizzle": {
      const object = evaluateShaderConstant(expression.expression, locals);
      return object && expression.components.map((index) => object[index]!);
    }
    case "call": {
      const args = expression.arguments.map((arg) =>
        evaluateShaderConstant(arg, locals),
      );
      if (args.some((arg) => !arg)) return undefined;
      const values = args.flatMap((arg) => arg!);
      if (expression.target.kind === "constructor") {
        const size =
          expression.type.kind === "vector" ? expression.type.size : 1;
        return values.length === 1 ? Array(size).fill(values[0]!) : values;
      }
      const [first, second] = args as readonly (readonly number[])[];
      if (!first || !first.every(Number.isFinite)) return undefined;
      // Use only precisely determined results. Approximate transcendentals,
      // reductions and normalization are deliberately not constant-folded.
      switch (expression.target.name) {
        case "sin":
          return first.every((value) => value === 0)
            ? first.map(() => 0)
            : undefined;
        case "cos":
          return first.every((value) => value === 0)
            ? first.map(() => 1)
            : undefined;
        case "abs":
          return first.map((value) => Math.abs(value));
        case "floor":
          return first.map((value) => Math.floor(value));
        case "ceil":
          return first.map((value) => Math.ceil(value));
        case "length":
          return first.length === 1 && first[0] === 0 ? [0] : undefined;
        case "fract":
        case "min":
        case "max":
          // Target-specific rounding/denormal behavior can change the
          // ordering; unknown values are handled by the WGSL helper.
          return undefined;
        case "dot":
        case "distance":
        case "cross":
        case "normalize":
        case "smoothstep":
          return undefined;
        default:
          return assertNever(expression.target);
      }
    }
    case "builtin-input":
    case "default-uniform":
      return undefined;
    default:
      return assertNever(expression);
  }
}

export function identicalConstantExpressions(
  left: ShaderExpression,
  right: ShaderExpression,
  locals: ReadonlyMap<ShaderLocalSymbolId, ShaderExpression>,
): boolean {
  const key = (expression: ShaderExpression): string | undefined => {
    switch (expression.kind) {
      case "numeric-literal":
        return `f32:${String(Math.fround(expression.value))}`;
      case "local-reference": {
        const initializer = locals.get(expression.symbolId);
        return initializer && key(initializer);
      }
      case "unary": {
        const child = key(expression.argument);
        return child && `unary:${expression.operator}(${child})`;
      }
      case "binary": {
        const a = key(expression.left);
        const b = key(expression.right);
        return a && b && `binary:${expression.operator}(${a},${b})`;
      }
      case "swizzle": {
        const object = key(expression.expression);
        return object && `swizzle:${expression.components.join("")}(${object})`;
      }
      case "call": {
        const args = expression.arguments.map(key);
        return args.every((arg) => arg !== undefined)
          ? `call:${expression.target.kind}:${expression.target.name}(${args.join(",")})`
          : undefined;
      }
      case "builtin-input":
      case "default-uniform":
        return undefined;
      default:
        return assertNever(expression);
    }
  };
  const a = key(left);
  return a !== undefined && a === key(right);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected constant expression: ${JSON.stringify(value)}`);
}
