import type {
  ShaderCallTarget,
  ShaderDefaultUniform,
  ShaderExpression,
  ShaderSwizzleComponents,
} from "./shader-ir.js";
import { shaderLocalName } from "./shader-local-name.js";

const DEFAULT_UNIFORM_ORDER: readonly ShaderDefaultUniform[] = [
  "resolution",
  "mouse",
  "time",
];

export interface GenerateWgslExpressionOptions {
  readonly customUniforms?: readonly string[];
  readonly fragmentPositionName?: string;
}

export type WgslSmoothstepShape = "f32" | "vec2" | "vec3" | "vec4";

export interface GeneratedWgslExpression {
  readonly code: string;
  readonly referencedUniforms: readonly ShaderDefaultUniform[];
  readonly referencedCustomUniforms?: readonly string[];
  readonly usesFragmentPosition: boolean;
  /** Module-level helpers needed to prevent WGSL const-edge shader-creation errors. */
  readonly smoothstepShapes: readonly WgslSmoothstepShape[];
}

interface GenerationState {
  readonly referencedUniforms: Set<ShaderDefaultUniform>;
  readonly referencedCustomUniforms: Set<string>;
  readonly smoothstepShapes: Set<WgslSmoothstepShape>;
  usesFragmentPosition: boolean;
}

/** Emits one typed IR expression as deterministic WGSL text. */
export function generateWgslExpression(
  expression: ShaderExpression,
  options: GenerateWgslExpressionOptions = {},
): GeneratedWgslExpression {
  const state: GenerationState = {
    referencedUniforms: new Set(),
    referencedCustomUniforms: new Set(),
    smoothstepShapes: new Set(),
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
    smoothstepShapes: (["f32", "vec2", "vec3", "vec4"] as const).filter(
      (shape) => state.smoothstepShapes.has(shape),
    ),
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

    case "custom-uniform": {
      state.referencedCustomUniforms.add(expression.name);
      const index = options.customUniforms?.indexOf(expression.name) ?? -1;
      if (index < 0)
        throw new Error(`Missing custom uniform ${expression.name}.`);
      return `shdr_custom.shdr_custom_${index}`;
    }

    case "local-reference":
      return shaderLocalName(expression.symbolId);

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

    case "call": {
      let name = callTargetName(expression.target);
      if (
        expression.target.kind === "builtin-function" &&
        expression.target.name === "smoothstep"
      ) {
        const shape: WgslSmoothstepShape =
          expression.type.kind === "scalar"
            ? "f32"
            : `vec${expression.type.size}`;
        state.smoothstepShapes.add(shape);
        name = `shdr_internal_smoothstep_${shape}`;
      }
      return `${name}(${expression.arguments
        .map((argument) => emitExpression(argument, options, state))
        .join(", ")})`;
    }

    default:
      return assertNever(expression);
  }
}

function formatWgslFloat(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot emit non-finite WGSL float ${String(value)}.`);
  }
  if (Object.is(value, -0)) return "-0.0f";

  const text = String(value);
  return `${text.includes(".") || /e/i.test(text) ? text : `${text}.0`}f`;
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
  throw new Error(`Unsupported WGSL IR value: ${JSON.stringify(value)}.`);
}
