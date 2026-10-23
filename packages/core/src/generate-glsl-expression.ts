import type {
  ShaderCallTarget,
  ShaderDefaultUniform,
  ShaderExpression,
  ShaderSwizzleComponents,
} from "./shader-ir.js";
import {
  emittedShaderLocalName,
  shaderFunctionName,
  type ShaderLocalNames,
} from "./shader-local-name.js";
import { groupShaderChild } from "./shader-expression-grouping.js";

const DEFAULT_UNIFORM_ORDER: readonly ShaderDefaultUniform[] = [
  "resolution",
  "mouse",
  "time",
];

export interface GenerateGlslExpressionOptions {
  readonly customUniforms?: readonly string[];
  readonly textures?: readonly string[];
  readonly localNames?: ShaderLocalNames;
  /**
   * Name of a module-level value containing canonical fragment position.
   * When omitted, the canonical value is constructed inline.
   */
  readonly fragmentPositionName?: string;
}

export type GlslModShape = "f32" | "vec2" | "vec3" | "vec4";

export interface GeneratedGlslExpression {
  readonly code: string;
  /** Explicit and backend-implicit uniform dependencies in stable order. */
  readonly referencedUniforms: readonly ShaderDefaultUniform[];
  /** Internal diagonal helpers required to evaluate constructor arguments once. */
  readonly matrixDiagonalSizes?: readonly (2 | 3 | 4)[];
  readonly referencedCustomUniforms?: readonly string[];
  readonly referencedTextures?: readonly string[];
  readonly usesFragmentPosition: boolean;
  readonly modShapes?: readonly GlslModShape[];
}

interface GenerationState {
  readonly referencedUniforms: Set<ShaderDefaultUniform>;
  readonly referencedCustomUniforms: Set<string>;
  readonly referencedTextures: Set<string>;
  readonly modShapes: Set<GlslModShape>;
  readonly matrixDiagonalSizes: Set<2 | 3 | 4>;
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
    referencedTextures: new Set(),
    modShapes: new Set(),
    matrixDiagonalSizes: new Set(),
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
    ...(options.textures
      ? {
          referencedTextures: options.textures.filter((name) =>
            state.referencedTextures.has(name),
          ),
        }
      : {}),
    usesFragmentPosition: state.usesFragmentPosition,
    ...(state.matrixDiagonalSizes.size
      ? {
          matrixDiagonalSizes: ([2, 3, 4] as const).filter((size) =>
            state.matrixDiagonalSizes.has(size),
          ),
        }
      : {}),
    ...(state.modShapes.size
      ? {
          modShapes: (["f32", "vec2", "vec3", "vec4"] as const).filter(
            (shape) => state.modShapes.has(shape),
          ),
        }
      : {}),
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

    case "texture": {
      state.referencedTextures.add(expression.name);
      const index = options.textures?.indexOf(expression.name) ?? -1;
      if (index < 0) throw new Error(`Missing texture ${expression.name}.`);
      return `shdr_texture_${index}`;
    }

    case "local-reference":
      return emittedShaderLocalName(expression.symbolId, options.localNames);

    case "swizzle":
      return `${groupShaderChild(
        expression.expression,
        expression,
        "receiver",
        emitExpression(expression.expression, options, state),
      )}.${swizzleName(expression.components)}`;

    case "binary": {
      const operator = expression.operator;
      switch (operator) {
        case "+":
        case "-":
        case "*":
        case "/":
          return `${groupShaderChild(expression.left, expression, "left", emitExpression(expression.left, options, state))} ${operator} ${groupShaderChild(expression.right, expression, "right", emitExpression(expression.right, options, state))}`;
        default:
          return assertNever(operator);
      }
    }

    case "unary": {
      const operator = expression.operator;
      switch (operator) {
        case "-":
          return `-${groupShaderChild(expression.argument, expression, "argument", emitExpression(expression.argument, options, state))}`;
        default:
          return assertNever(operator);
      }
    }

    case "call": {
      const args = expression.arguments.map((argument) =>
        emitExpression(argument, options, state),
      );
      if (expression.target.kind === "texture-sample") {
        state.referencedTextures.add(expression.target.textureName);
        const index =
          options.textures?.indexOf(expression.target.textureName) ?? -1;
        if (index < 0)
          throw new Error(`Missing texture ${expression.target.textureName}.`);
        return `texture(shdr_texture_${index}, ${args[0]})`;
      }
      let name = callTargetName(expression.target);
      if (
        expression.target.kind === "constructor" &&
        expression.target.name.startsWith("mat") &&
        expression.arguments.length === 1 &&
        expression.arguments[0]?.type.kind === "scalar"
      ) {
        const size = Number(expression.target.name.slice(3)) as 2 | 3 | 4;
        state.matrixDiagonalSizes.add(size);
        return `shdr_internal_mat${size}(${args[0]})`;
      }
      if (
        expression.target.kind === "builtin-function" &&
        expression.target.name === "mod"
      ) {
        const shape: GlslModShape =
          expression.type.kind === "scalar"
            ? "f32"
            : expression.type.kind === "vector"
              ? `vec${expression.type.size}`
              : (() => {
                  throw new Error("Texture handles cannot be builtin results.");
                })();
        state.modShapes.add(shape);
        name = `shdr_internal_mod_${shape}`;
      }
      if (
        expression.target.kind === "builtin-function" &&
        expression.type.kind === "vector"
      ) {
        const scalarArguments =
          expression.target.name === "clamp"
            ? [1, 2]
            : expression.target.name === "pow"
              ? [1]
              : expression.target.name === "mod"
                ? [1]
                : [];
        const vector = `vec${expression.type.size}`;
        for (const index of scalarArguments) {
          if (expression.arguments[index]?.type.kind === "scalar")
            args[index] = `${vector}(${args[index]})`;
        }
      }
      if (
        expression.target.kind === "builtin-function" &&
        expression.target.name === "dFdy"
      )
        return `(-${name}(${args.join(", ")}))`;
      return `${name}(${args.join(", ")})`;
    }

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
    case "shader-function":
      return shaderFunctionName(target.functionId);
    case "constructor":
      return target.name;
    case "texture-sample":
      throw new Error("Texture samples require texture-aware emission.");
    case "builtin-function":
      switch (target.name) {
        case "sin":
        case "cos":
        case "dFdx":
        case "dFdy":
        case "fwidth":
        case "asin":
        case "acos":
        case "atan":
        case "radians":
        case "degrees":
        case "ceil":
        case "sqrt":
        case "exp":
        case "tanh":
        case "clamp":
        case "pow":
        case "mod":
        case "distance":
        case "cross":
        case "smoothstep":
        case "abs":
        case "floor":
        case "fract":
        case "min":
        case "max":
        case "mix":
        case "step":
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
