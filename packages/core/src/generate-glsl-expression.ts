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

export interface GenerateGlslExpressionOptions {
  readonly customUniforms?: readonly string[];
  /**
   * Name of a module-level value containing canonical fragment position.
   * When omitted, the canonical value is constructed inline.
   */
  readonly fragmentPositionName?: string;
}

export interface GeneratedGlslExpression {
  readonly code: string;
  /** Explicit and backend-implicit uniform dependencies in stable order. */
  readonly referencedUniforms: readonly ShaderDefaultUniform[];
  readonly referencedCustomUniforms?: readonly string[];
  readonly usesFragmentPosition: boolean;
}

interface GenerationState {
  readonly referencedUniforms: Set<ShaderDefaultUniform>;
  readonly referencedCustomUniforms: Set<string>;
  usesFragmentPosition: boolean;
}

/** Emits one typed IR expression as deterministic GLSL ES 3.00 text. */
export function generateGlslExpression(
  expression: ShaderExpression,
  options: GenerateGlslExpressionOptions = {},
): GeneratedGlslExpression {
  const state: GenerationState = {
    referencedUniforms: new Set(),
    referencedCustomUniforms: new Set(),
    usesFragmentPosition: false,
  };
  const code = emitExpression(expression, options, state);

  return {
    code,
    referencedUniforms: DEFAULT_UNIFORM_ORDER.filter((uniform) =>
      state.referencedUniforms.has(uniform),
    ),
    ...(options.customUniforms
      ? {
          referencedCustomUniforms: options.customUniforms.filter((name) =>
            state.referencedCustomUniforms.has(name),
          ),
        }
      : {}),
    usesFragmentPosition: state.usesFragmentPosition,
  };
}

function emitExpression(
  expression: ShaderExpression,
  options: GenerateGlslExpressionOptions,
  state: GenerationState,
): string {
  switch (expression.kind) {
    case "numeric-literal":
      return formatGlslFloat(expression.value);

    case "builtin-input":
      switch (expression.input) {
        case "fragment-position":
          state.usesFragmentPosition = true;
          state.referencedUniforms.add("resolution");
          return (
            options.fragmentPositionName ??
            "vec4(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y, gl_FragCoord.z, gl_FragCoord.w)"
          );
        default:
          return assertNever(expression.input);
      }

    case "default-uniform":
      state.referencedUniforms.add(expression.uniform);
      return defaultUniformName(expression.uniform);

    case "custom-uniform": {
      state.referencedCustomUniforms.add(expression.name);
      const index = options.customUniforms?.indexOf(expression.name) ?? -1;
      if (index < 0)
        throw new Error(`Missing custom uniform ${expression.name}.`);
      return `shdr_custom_${index}`;
    }

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

function formatGlslFloat(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot emit non-finite GLSL float ${String(value)}.`);
  }
  if (Object.is(value, -0)) return "-0.0";

  const text = String(value);
  return text.includes(".") || /e/i.test(text) ? text : `${text}.0`;
}

function defaultUniformName(uniform: ShaderDefaultUniform): string {
  switch (uniform) {
    case "resolution":
      return "u_resolution";
    case "mouse":
      return "u_mouse";
    case "time":
      return "u_time";
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
      return target.name;
    case "builtin-function":
      switch (target.name) {
        case "sin":
        case "cos":
        case "ceil":
        case "distance":
        case "cross":
        case "smoothstep":
        case "abs":
        case "floor":
        case "fract":
        case "min":
        case "max":
        case "dot":
        case "length":
        case "normalize":
          return target.name;
        default:
          return assertNever(target);
      }
    default:
      return assertNever(target);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported GLSL IR value: ${JSON.stringify(value)}.`);
}
