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
      if (
        left.length !== right.length &&
        left.length !== 1 &&
        right.length !== 1
      )
        return undefined;
      const length = Math.max(left.length, right.length);
      return Array.from({ length }, (_, index) => {
        const value = left[left.length === 1 ? 0 : index]!;
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
    case "custom-uniform":
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
  // Compare the expression DAG rather than expanding every local into a
  // string. Repeated references to a shared initializer are visited once per
  // pair, and the explicit stack also handles long chains of local aliases.
  const pending: [ShaderExpression, ShaderExpression][] = [[left, right]];
  const compared = new WeakMap<ShaderExpression, WeakSet<ShaderExpression>>();
  while (pending.length) {
    let [a, b] = pending.pop()!;
    if (a.kind === "local-reference") {
      const initializer = locals.get(a.symbolId);
      if (!initializer) return false;
      pending.push([initializer, b]);
      continue;
    }
    if (b.kind === "local-reference") {
      const initializer = locals.get(b.symbolId);
      if (!initializer) return false;
      pending.push([a, initializer]);
      continue;
    }
    if (a.kind !== b.kind) return false;
    let matches = compared.get(a);
    if (matches?.has(b)) continue;
    if (!matches) {
      matches = new WeakSet();
      compared.set(a, matches);
    }
    matches.add(b);

    if (a.kind === "numeric-literal" && b.kind === "numeric-literal") {
      if (String(Math.fround(a.value)) !== String(Math.fround(b.value)))
        return false;
    } else if (a.kind === "unary" && b.kind === "unary") {
      if (a.operator !== b.operator) return false;
      pending.push([a.argument, b.argument]);
    } else if (a.kind === "binary" && b.kind === "binary") {
      if (a.operator !== b.operator) return false;
      pending.push([a.left, b.left], [a.right, b.right]);
    } else if (a.kind === "swizzle" && b.kind === "swizzle") {
      if (a.components.join("") !== b.components.join("")) return false;
      pending.push([a.expression, b.expression]);
    } else if (a.kind === "call" && b.kind === "call") {
      if (
        a.target.kind !== b.target.kind ||
        a.target.name !== b.target.name ||
        a.arguments.length !== b.arguments.length
      )
        return false;
      for (let index = 0; index < a.arguments.length; index++)
        pending.push([a.arguments[index]!, b.arguments[index]!]);
    } else {
      // Automatic inputs and uniforms are not compile-time constants, even
      // when the same expression appears on both sides.
      return false;
    }
  }
  return true;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected constant expression: ${JSON.stringify(value)}`);
}
