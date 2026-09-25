import type {
  ShaderCallTarget,
  ShaderDefaultUniform,
  ShaderExpression,
  ShaderSwizzleComponents,
} from "./shader-ir.js";

const DEFAULT_UNIFORM_ORDER: readonly ShaderDefaultUniform[] = [
  "resolution",
  "mouse",
  "time",
];

export interface GenerateWgslExpressionOptions {
  readonly fragmentPositionName?: string;
}

export interface GeneratedWgslExpression {
  readonly code: string;
  readonly referencedUniforms: readonly ShaderDefaultUniform[];
  readonly usesFragmentPosition: boolean;
}

interface GenerationState {
  readonly referencedUniforms: Set<ShaderDefaultUniform>;
  usesFragmentPosition: boolean;
}

/** Emits one typed IR expression as deterministic WGSL text. */
export function generateWgslExpression(
  expression: ShaderExpression,
  options: GenerateWgslExpressionOptions = {},
): GeneratedWgslExpression {
  const state: GenerationState = {
    referencedUniforms: new Set(),
    usesFragmentPosition: false,
  };
  const code = emitExpression(expression, options, state);

  return {
    code,
    referencedUniforms: DEFAULT_UNIFORM_ORDER.filter((uniform) =>
      state.referencedUniforms.has(uniform),
    ),
    usesFragmentPosition: state.usesFragmentPosition,
  };
}

function emitExpression(
  expression: ShaderExpression,
  options: GenerateWgslExpressionOptions,
  state: GenerationState,
): string {
  switch (expression.kind) {
    case "numeric-literal":
      return formatWgslFloat(expression.value);

    case "builtin-input":
      switch (expression.input) {
        case "fragment-position":
          state.usesFragmentPosition = true;
          return options.fragmentPositionName ?? "shdr_coord";
        default:
          return assertNever(expression.input);
      }

    case "default-uniform":
      state.referencedUniforms.add(expression.uniform);
      return defaultUniformName(expression.uniform);

    case "local-reference":
      return expression.name;

    case "swizzle":
      return `(${emitExpression(expression.expression, options, state)}).${swizzleName(expression.components)}`;

    case "binary": {
      const operator = expression.operator;
      switch (operator) {
        case "+":
        case "-":
        case "*":
        case "/":
          return `(${emitExpression(expression.left, options, state)} ${operator} ${emitExpression(expression.right, options, state)})`;
        default:
          return assertNever(operator);
      }
    }

    case "unary": {
      const operator = expression.operator;
      switch (operator) {
        case "-":
          return `(-${emitExpression(expression.argument, options, state)})`;
        default:
          return assertNever(operator);
      }
    }

    case "call":
      return `${callTargetName(expression.target)}(${expression.arguments
        .map((argument) => emitExpression(argument, options, state))
        .join(", ")})`;

    default:
      return assertNever(expression);
  }
}

function formatWgslFloat(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot emit non-finite WGSL float ${String(value)}.`);
  }
  if (Object.is(value, -0)) return "-0.0";

  const text = String(value);
  return text.includes(".") || /e/i.test(text) ? text : `${text}.0`;
}

function defaultUniformName(uniform: ShaderDefaultUniform): string {
  switch (uniform) {
    case "resolution":
      return "shdr_resolution";
    case "mouse":
      return "shdr_mouse";
    case "time":
      return "shdr_time";
    default:
      return assertNever(uniform);
  }
}

function swizzleName(components: ShaderSwizzleComponents): string {
  return components.map(componentName).join("");
}

function componentName(component: 0 | 1 | 2 | 3): string {
  switch (component) {
    case 0:
      return "x";
    case 1:
      return "y";
    case 2:
      return "z";
    case 3:
      return "w";
    default:
      return assertNever(component);
  }
}

function callTargetName(target: ShaderCallTarget): string {
  switch (target.kind) {
    case "constructor":
      switch (target.name) {
        case "vec2":
          return "vec2<f32>";
        case "vec3":
          return "vec3<f32>";
        case "vec4":
          return "vec4<f32>";
      }
    case "builtin-function":
      throw new Error("No WGSL built-in function calls are supported.");
    default:
      return assertNever(target);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported WGSL IR value: ${JSON.stringify(value)}.`);
}
