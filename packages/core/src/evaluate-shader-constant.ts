import type { ShaderExpression, ShaderLocalSymbolId } from "./shader-ir.js";

/** Undefined means one component is not provably constant; other components remain known. */
export type ShaderKnownComponents = readonly (number | undefined)[];

/** Conservative f32 component analysis; never approximate target-dependent math. */
export function evaluateShaderComponents(
  expression: ShaderExpression,
  locals: ReadonlyMap<ShaderLocalSymbolId, ShaderKnownComponents>,
  cache?: WeakMap<ShaderExpression, ShaderKnownComponents>,
): ShaderKnownComponents {
  const cached = cache?.get(expression);
  if (cached) return cached;
  const result = calculateShaderComponents(expression, locals, cache);
  cache?.set(expression, result);
  return result;
}

function calculateShaderComponents(
  expression: ShaderExpression,
  locals: ReadonlyMap<ShaderLocalSymbolId, ShaderKnownComponents>,
  cache?: WeakMap<ShaderExpression, ShaderKnownComponents>,
): ShaderKnownComponents {
  const unknown = (): ShaderKnownComponents =>
    Array(expression.type.kind === "vector" ? expression.type.size : 1).fill(
      undefined,
    );
  switch (expression.kind) {
    case "numeric-literal":
      return [Math.fround(expression.value)];
    case "local-reference":
      return locals.get(expression.symbolId) ?? unknown();
    case "unary":
      return evaluateShaderComponents(expression.argument, locals, cache).map(
        (value) => (value === undefined ? undefined : Math.fround(-value)),
      );
    case "binary": {
      const left = evaluateShaderComponents(expression.left, locals, cache);
      const right = evaluateShaderComponents(expression.right, locals, cache);
      return Array.from({ length: unknown().length }, (_, index) => {
        const value = left[left.length === 1 ? 0 : index];
        const other = right[right.length === 1 ? 0 : index];
        if (value === undefined || other === undefined) return undefined;
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
      const object = evaluateShaderComponents(
        expression.expression,
        locals,
        cache,
      );
      return expression.components.map((index) => object[index]);
    }
    case "call": {
      const args = expression.arguments.map((arg) =>
        evaluateShaderComponents(arg, locals, cache),
      );
      const values = args.flat();
      if (expression.target.kind === "constructor")
        return values.length === 1
          ? Array(unknown().length).fill(values[0])
          : values;
      const first = args[0];
      if (!first) return unknown();
      // A known non-finite argument remains visible through otherwise unknown
      // builtins, so an enclosing PR 3 call can diagnose WGSL const overflow.
      const nonFinite = args.some((arg) =>
        arg.some((value) => value !== undefined && !Number.isFinite(value)),
      );
      if (nonFinite) return Array(unknown().length).fill(NaN);
      const exact = (
        value: number | undefined,
        known: number,
        result: number,
      ) => (value === known ? result : undefined);
      switch (expression.target.name) {
        case "sin":
        case "tanh":
          return first.map((value) => exact(value, 0, 0));
        case "cos":
        case "exp":
          return first.map((value) => exact(value, 0, 1));
        case "sqrt":
          return first.map((value) =>
            value === 0 || value === 1 ? value : undefined,
          );
        case "pow": {
          const exponent = args[1];
          return first.map((base, index) => {
            const power = exponent?.[index];
            if (base === undefined || power === undefined) return undefined;
            if (base === 1 || (base > 0 && power === 0)) return 1;
            return base === 0 && power > 0 ? 0 : undefined;
          });
        }
        case "clamp": {
          const low = args[1];
          const high = args[2];
          return first.map((value, index) => {
            const min = low?.[index];
            const max = high?.[index];
            return value !== undefined &&
              min !== undefined &&
              max !== undefined &&
              min <= max
              ? Math.min(Math.max(value, min), max)
              : undefined;
          });
        }
        case "abs":
          return first.map((value) =>
            value === undefined ? undefined : Math.abs(value),
          );
        case "floor":
          return first.map((value) =>
            value === undefined ? undefined : Math.floor(value),
          );
        case "ceil":
          return first.map((value) =>
            value === undefined ? undefined : Math.ceil(value),
          );
        case "length":
          return first.length === 1 && first[0] === 0 ? [0] : unknown();
        case "fract":
        case "min":
        case "max":
        case "mix":
        case "step":
        case "dot":
        case "distance":
        case "cross":
        case "normalize":
        case "smoothstep":
          return unknown();
        default:
          return assertNever(expression.target);
      }
    }
    case "builtin-input":
    case "default-uniform":
    case "custom-uniform":
      return unknown();
    default:
      return assertNever(expression);
  }
}

/** Only entirely known vectors count as constants for existing comparisons. */
export function evaluateShaderConstant(
  expression: ShaderExpression,
  locals: ReadonlyMap<ShaderLocalSymbolId, ShaderKnownComponents>,
): readonly number[] | undefined {
  const components = evaluateShaderComponents(expression, locals);
  return components.every((value) => value !== undefined)
    ? (components as readonly number[])
    : undefined;
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
