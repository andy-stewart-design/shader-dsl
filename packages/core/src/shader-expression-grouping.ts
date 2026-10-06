import type { ShaderExpression } from "./shader-ir.js";
import type { ShaderBinaryOperator } from "./shader-operator.js";

type ParentExpression = Extract<
  ShaderExpression,
  { readonly kind: "binary" | "unary" | "swizzle" | "call" }
>;

function binaryPrecedence(operator: ShaderBinaryOperator): number {
  switch (operator) {
    case "+":
    case "-":
      return 1;
    case "*":
    case "/":
      return 2;
    default:
      return assertNever(operator);
  }
}

/** Keep the exact IR tree: right children at equal precedence must not reassociate f32. */
export function groupShaderChild(
  child: ShaderExpression,
  parent: ParentExpression,
  side: "left" | "right" | "argument" | "receiver",
  code: string,
): string {
  let group = false;
  switch (parent.kind) {
    case "binary":
      group =
        child.kind === "binary" &&
        (binaryPrecedence(child.operator) < binaryPrecedence(parent.operator) ||
          (side === "right" &&
            binaryPrecedence(child.operator) ===
              binaryPrecedence(parent.operator)));
      break;
    case "unary":
      // -(-x) must not lex as --x. Direct IR can also contain negative literals.
      group =
        child.kind === "binary" ||
        child.kind === "unary" ||
        (child.kind === "numeric-literal" &&
          (child.value < 0 || Object.is(child.value, -0)));
      break;
    case "swizzle":
      // Calls, uniforms, locals and other swizzles are valid postfix receivers.
      group = child.kind === "binary" || child.kind === "unary";
      break;
    case "call":
      // Each argument is already delimited by its call parentheses and commas.
      break;
    default:
      return assertNever(parent);
  }
  return group ? `(${code})` : code;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported shader expression: ${JSON.stringify(value)}.`);
}
