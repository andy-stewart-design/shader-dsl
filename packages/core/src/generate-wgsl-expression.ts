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

export interface GenerateWgslExpressionOptions {
  readonly customUniforms?: readonly string[];
  readonly textures?: readonly string[];
  readonly localNames?: ShaderLocalNames;
  readonly fragmentPositionName?: string;
}

export type WgslSmoothstepShape = "f32" | "vec2" | "vec3" | "vec4";
export type WgslGuardedBuiltin =
  "asin" | "acos" | "degrees" | "sqrt" | "exp" | "clamp" | "pow";
export type WgslGuardedSignature =
  `${WgslGuardedBuiltin}_${WgslSmoothstepShape}`;

export interface GeneratedWgslExpression {
  readonly code: string;
  readonly referencedUniforms: readonly ShaderDefaultUniform[];
  readonly referencedCustomUniforms?: readonly string[];
  readonly referencedTextures?: readonly string[];
  readonly usesFragmentPosition: boolean;
  /** Module-level helpers needed to prevent WGSL const-edge shader-creation errors. */
  readonly smoothstepShapes: readonly WgslSmoothstepShape[];
  /** Parameterized WGSL calls prevent eager constant-domain/overflow failures. */
  readonly guardedBuiltinSignatures?: readonly WgslGuardedSignature[];
  /** Internal floor-based modulo helpers required by generated calls. */
  readonly modShapes?: readonly WgslSmoothstepShape[];
}

interface GenerationState {
  readonly referencedUniforms: Set<ShaderDefaultUniform>;
  readonly referencedCustomUniforms: Set<string>;
  readonly referencedTextures: Set<string>;
  readonly smoothstepShapes: Set<WgslSmoothstepShape>;
  readonly guardedBuiltinSignatures: Set<WgslGuardedSignature>;
  readonly modShapes: Set<WgslSmoothstepShape>;
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
    referencedTextures: new Set(),
    smoothstepShapes: new Set(),
    guardedBuiltinSignatures: new Set(),
    modShapes: new Set(),
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
    smoothstepShapes: (["f32", "vec2", "vec3", "vec4"] as const).filter(
      (shape) => state.smoothstepShapes.has(shape),
    ),
    ...(state.guardedBuiltinSignatures.size
      ? { guardedBuiltinSignatures: [...state.guardedBuiltinSignatures].sort() }
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
        case "-": {
          const left = emitExpression(expression.left, options, state);
          const right = emitExpression(expression.right, options, state);
          if (expression.type.kind !== "vector")
            return `${groupShaderChild(expression.left, expression, "left", left)} ${operator} ${groupShaderChild(expression.right, expression, "right", right)}`;
          const vector = `vec${expression.type.size}<f32>`;
          // Scalar operands are already delimited by the splat constructor.
          const emittedLeft =
            expression.left.type.kind === "scalar"
              ? `${vector}(${left})`
              : groupShaderChild(expression.left, expression, "left", left);
          const emittedRight =
            expression.right.type.kind === "scalar"
              ? `${vector}(${right})`
              : groupShaderChild(expression.right, expression, "right", right);
          return `${emittedLeft} ${operator} ${emittedRight}`;
        }
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
        return `textureSample(shdr_texture_${index}, shdr_sampler_${index}, ${args[0]})`;
      }
      let name = callTargetName(expression.target);
      if (
        expression.target.kind === "builtin-function" &&
        expression.target.name === "atan" &&
        expression.arguments.length === 2
      ) {
        name = "atan2";
      }
      if (
        expression.target.kind === "builtin-function" &&
        expression.target.name === "mod"
      ) {
        const shape: WgslSmoothstepShape =
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
        expression.target.name === "smoothstep"
      ) {
        const shape: WgslSmoothstepShape =
          expression.type.kind === "scalar"
            ? "f32"
            : expression.type.kind === "vector"
              ? `vec${expression.type.size}`
              : (() => {
                  throw new Error("Texture handles cannot be builtin results.");
                })();
        state.smoothstepShapes.add(shape);
        name = `shdr_internal_smoothstep_${shape}`;
      }
      if (
        expression.target.kind === "builtin-function" &&
        (expression.target.name === "asin" ||
          expression.target.name === "acos" ||
          expression.target.name === "degrees" ||
          expression.target.name === "sqrt" ||
          expression.target.name === "exp" ||
          expression.target.name === "clamp" ||
          expression.target.name === "pow")
      ) {
        const shape: WgslSmoothstepShape =
          expression.type.kind === "scalar"
            ? "f32"
            : expression.type.kind === "vector"
              ? `vec${expression.type.size}`
              : (() => {
                  throw new Error("Texture handles cannot be builtin results.");
                })();
        const signature: WgslGuardedSignature = `${expression.target.name}_${shape}`;
        state.guardedBuiltinSignatures.add(signature);
        name = `shdr_internal_safe_${signature}`;
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
              : expression.target.name === "step"
                ? [0]
                : expression.target.name === "mod"
                  ? [1]
                  : [];
        const vector = `vec${expression.type.size}<f32>`;
        for (const index of scalarArguments) {
          if (expression.arguments[index]?.type.kind === "scalar")
            args[index] = `${vector}(${args[index]})`;
        }
      }
      return `${name}(${args.join(", ")})`;
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
    case "shader-function":
      return shaderFunctionName(target.functionId);
    case "constructor":
      switch (target.name) {
        case "vec2":
          return "vec2<f32>";
        case "vec3":
          return "vec3<f32>";
        case "vec4":
          return "vec4<f32>";
      }
    case "texture-sample":
      throw new Error("Texture samples require texture-aware emission.");
    case "builtin-function":
      switch (target.name) {
        case "sin":
        case "cos":
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
  throw new Error(`Unsupported WGSL IR value: ${JSON.stringify(value)}.`);
}
