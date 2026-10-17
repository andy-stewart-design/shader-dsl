import { ShaderDiagnosticCode, type ShaderDiagnostic } from "./diagnostics.js";
import {
  evaluateShaderComponents,
  evaluateShaderConstant,
  identicalConstantExpressions,
  type ShaderKnownComponents,
} from "./evaluate-shader-constant.js";
import { isFiniteF32, MAX_F32 } from "./finite-f32.js";
import { builtinResultType, isShaderBuiltinName } from "./shader-builtin.js";
import type {
  ShaderConstDeclaration,
  ShaderDefaultUniform,
  ShaderDefaultUniformExpression,
  ShaderExpression,
  ShaderLocalSymbolId,
  ShaderModule,
  ShaderSwizzleComponents,
  ShaderVectorComponent,
  ShaderFunction,
  ShaderFunctionParameter,
  ShaderStatement,
} from "./shader-ir.js";
import type {
  ShaderCustomUniformDeclaration,
  ShaderCustomUniformType,
  ShaderTextureDeclaration,
} from "shdr";
import type {
  ShaderBinaryExpressionSyntax,
  ShaderCallbackSyntax,
  ShaderCallExpressionSyntax,
  ShaderExpressionSyntax,
  ShaderPropertyAccessSyntax,
} from "./shader-syntax.js";
import { sameShaderValueType } from "./shader-type.js";
import type {
  ShaderMatrixType,
  ShaderScalarType,
  ShaderValueType,
  ShaderVectorType,
} from "./shader-type.js";
import type { TextRange } from "./source-range.js";

const F32_TYPE: ShaderScalarType = { kind: "scalar", scalar: "f32" };
const VEC2_F32_TYPE: ShaderVectorType = {
  kind: "vector",
  scalar: "f32",
  size: 2,
};
const VEC3_F32_TYPE: ShaderVectorType = {
  kind: "vector",
  scalar: "f32",
  size: 3,
};
const VEC4_F32_TYPE: ShaderVectorType = {
  kind: "vector",
  scalar: "f32",
  size: 4,
};
const MAT2_F32_TYPE: ShaderMatrixType = {
  kind: "matrix",
  scalar: "f32",
  columns: 2,
  rows: 2,
};
const MAT3_F32_TYPE: ShaderMatrixType = {
  kind: "matrix",
  scalar: "f32",
  columns: 3,
  rows: 3,
};
const MAT4_F32_TYPE: ShaderMatrixType = {
  kind: "matrix",
  scalar: "f32",
  columns: 4,
  rows: 4,
};
const TEXTURE_2D_TYPE = { kind: "texture2D" } as const;
const CONTEXT_BINDING_NAMES = new Set(["coord", "uniforms"]);

export interface LowerShaderSyntaxSuccess {
  readonly ok: true;
  readonly module: ShaderModule;
  readonly diagnostics: readonly [];
}

export interface LowerShaderSyntaxFailure {
  readonly ok: false;
  readonly diagnostics: readonly ShaderDiagnostic[];
}

export type LowerShaderSyntaxResult =
  LowerShaderSyntaxSuccess | LowerShaderSyntaxFailure;

interface LocalBinding {
  readonly name: string;
  readonly symbolId: ShaderLocalSymbolId;
  readonly type: ShaderValueType;
}

interface LoweringContext {
  readonly locals: Map<string, LocalBinding>;
  readonly futureNames: ReadonlySet<string>;
  readonly constantLocals: Map<ShaderLocalSymbolId, ShaderKnownComponents>;
  readonly localInitializers: Map<ShaderLocalSymbolId, ShaderExpression>;
  readonly customUniforms: ReadonlyMap<
    string,
    ShaderCustomUniformDeclaration | ShaderTextureDeclaration
  >;
  readonly contextBindings: ReadonlySet<string>;
  readonly sampleCallables: ReadonlySet<string>;
  readonly contextName?: string;
  readonly importedCallables: ReadonlySet<string>;
  readonly functions: ReadonlyMap<string, ShaderFunction>;
}

type LowerExpressionResult =
  | { readonly ok: true; readonly expression: ShaderExpression }
  | { readonly ok: false; readonly diagnostic: ShaderDiagnostic };

export interface LowerShaderSyntaxOptions {
  readonly functions?: ReadonlyMap<string, ShaderFunction>;
  readonly sampleCallables?: ReadonlySet<string>;
}

interface LowerShaderBodyOptions extends LowerShaderSyntaxOptions {
  readonly parameters?: readonly ShaderFunctionParameter[];
}

type LowerShaderBodyResult =
  | {
      readonly ok: true;
      readonly statements: readonly ShaderStatement[];
      readonly returnType: ShaderValueType;
      readonly diagnostics: readonly [];
    }
  | LowerShaderSyntaxFailure;

/** Lowers normalized fragment syntax without consulting a target backend. */
export function lowerShaderSyntax(
  syntax: ShaderCallbackSyntax,
  importedCallables: ReadonlySet<string> = new Set(),
  customUniforms: readonly (
    ShaderCustomUniformDeclaration | ShaderTextureDeclaration
  )[] = [],
  options: LowerShaderSyntaxOptions = {},
): LowerShaderSyntaxResult {
  const body = lowerShaderBody(
    syntax,
    importedCallables,
    customUniforms,
    options,
  );
  if (!body.ok) return body;
  if (!isVec4(body.returnType)) {
    return failure(
      diagnostic(
        ShaderDiagnosticCode.InvalidReturnType,
        `Fragment shaders must return "Expr<Vec4<F32>>"; received ${JSON.stringify(formatExpressionType(body.returnType))}.`,
        syntax.returnExpression.range,
      ),
    );
  }
  return {
    ok: true,
    module: {
      kind: "shader-module",
      stage: "fragment",
      ...(customUniforms.some((item) => item.type !== "texture2D")
        ? {
            customUniforms: customUniforms.filter(
              (item): item is ShaderCustomUniformDeclaration =>
                item.type !== "texture2D",
            ),
          }
        : {}),
      statements: body.statements,
      range: syntax.range,
    },
    diagnostics: [],
  };
}

/** Shared straight-line body lowering; helpers produce functions, never fake fragments. */
export function lowerShaderBody(
  syntax: ShaderCallbackSyntax,
  importedCallables: ReadonlySet<string>,
  customUniforms: readonly (
    ShaderCustomUniformDeclaration | ShaderTextureDeclaration
  )[],
  options: LowerShaderBodyOptions,
): LowerShaderBodyResult {
  const locals = new Map<string, LocalBinding>(
    options.parameters?.map((parameter) => [parameter.name, parameter]) ?? [],
  );
  const functions = options.functions ?? new Map<string, ShaderFunction>();
  const constantLocals = new Map<ShaderLocalSymbolId, ShaderKnownComponents>();
  const localInitializers = new Map<ShaderLocalSymbolId, ShaderExpression>();
  const futureNames = new Set(
    syntax.declarations.map((declaration) => declaration.name),
  );
  const statements: ShaderConstDeclaration[] = [];
  const custom = new Map(customUniforms.map((item) => [item.name, item]));
  const contextBindings = new Set(
    options.parameters ? [] : (syntax.contextBindings ?? ["coord", "uniforms"]),
  );
  let nextSymbolId = options.parameters?.length ?? 0;

  for (const declaration of syntax.declarations) {
    if (
      (!options.parameters &&
        (CONTEXT_BINDING_NAMES.has(declaration.name) ||
          syntax.contextName === declaration.name)) ||
      importedCallables.has(declaration.name) ||
      locals.has(declaration.name)
    ) {
      return failure(
        diagnostic(
          ShaderDiagnosticCode.DuplicateLocal,
          CONTEXT_BINDING_NAMES.has(declaration.name) ||
            syntax.contextName === declaration.name
            ? `Shader local ${JSON.stringify(declaration.name)} conflicts with a shader context binding.`
            : importedCallables.has(declaration.name)
              ? `Shader local ${JSON.stringify(declaration.name)} shadows an imported shader callable.`
              : `Shader local ${JSON.stringify(declaration.name)} is declared more than once.`,
          declaration.nameRange,
        ),
      );
    }

    const initializer = lowerExpression(declaration.initializer, {
      locals,
      futureNames,
      constantLocals,
      localInitializers,
      customUniforms: custom,
      contextBindings,
      ...(options.parameters ? {} : { contextName: syntax.contextName }),
      importedCallables,
      functions,
      sampleCallables: options.sampleCallables ?? new Set(),
    });
    if (!initializer.ok) return failure(initializer.diagnostic);

    const symbolId = nextSymbolId;
    nextSymbolId += 1;
    constantLocals.set(
      symbolId,
      evaluateShaderComponents(initializer.expression, constantLocals),
    );
    localInitializers.set(symbolId, initializer.expression);
    futureNames.delete(declaration.name);
    if (textureNameOf(initializer.expression, localInitializers)) {
      locals.set(declaration.name, {
        name: declaration.name,
        symbolId,
        type: TEXTURE_2D_TYPE as unknown as ShaderValueType,
      });
      continue;
    }
    locals.set(declaration.name, {
      name: declaration.name,
      symbolId,
      type: initializer.expression.type,
    });
    statements.push({
      kind: "const-declaration",
      name: declaration.name,
      symbolId,
      nameRange: declaration.nameRange,
      initializer: initializer.expression,
      range: declaration.range,
    });
  }

  const returned = lowerExpression(syntax.returnExpression, {
    locals,
    futureNames,
    constantLocals,
    localInitializers,
    customUniforms: custom,
    contextBindings,
    ...(options.parameters ? {} : { contextName: syntax.contextName }),
    importedCallables,
    functions,
    sampleCallables: options.sampleCallables ?? new Set(),
  });
  if (!returned.ok) return failure(returned.diagnostic);
  return {
    ok: true,
    statements: [
      ...statements,
      {
        kind: "return-statement",
        expression: returned.expression,
        range: syntax.returnRange,
      },
    ],
    returnType: returned.expression.type,
    diagnostics: [],
  };
}

function lowerExpression(
  syntax: ShaderExpressionSyntax,
  context: LoweringContext,
): LowerExpressionResult {
  switch (syntax.kind) {
    case "numeric-literal":
      if (!isFiniteF32(syntax.value))
        return expressionFailure(
          ShaderDiagnosticCode.InvalidNumericLiteral,
          "Shader numeric literals must be finite without f32 overflow.",
          syntax.range,
        );
      return {
        ok: true,
        expression: {
          kind: "numeric-literal",
          value: syntax.value,
          type: F32_TYPE,
          range: syntax.range,
        },
      };

    case "identifier": {
      if (syntax.name === context.contextName) {
        return expressionFailure(
          ShaderDiagnosticCode.UnsupportedPropertyAccess,
          "The fragment context must be accessed through coord or uniforms.",
          syntax.range,
        );
      }
      if (syntax.name === "coord" && context.contextBindings.has("coord")) {
        return {
          ok: true,
          expression: {
            kind: "builtin-input",
            input: "fragment-position",
            type: VEC4_F32_TYPE,
            range: syntax.range,
          },
        };
      }

      if (
        syntax.name === "uniforms" &&
        context.contextBindings.has("uniforms")
      ) {
        return expressionFailure(
          ShaderDiagnosticCode.InvalidUniform,
          "The uniforms context must be accessed through a supported property.",
          syntax.range,
        );
      }

      const local = context.locals.get(syntax.name);
      if (local) {
        return {
          ok: true,
          expression: {
            kind: "local-reference",
            name: local.name,
            symbolId: local.symbolId,
            type: local.type,
            range: syntax.range,
          },
        };
      }

      if (context.futureNames.has(syntax.name)) {
        return expressionFailure(
          ShaderDiagnosticCode.ForwardReference,
          `Shader local ${JSON.stringify(syntax.name)} cannot be referenced before its declaration.`,
          syntax.range,
        );
      }

      return expressionFailure(
        ShaderDiagnosticCode.UnknownIdentifier,
        `Unknown shader identifier ${JSON.stringify(syntax.name)}; shader callbacks cannot capture outer values.`,
        syntax.range,
      );
    }

    case "parenthesized-expression":
      return lowerExpression(syntax.expression, context);

    case "property-access":
      if (
        syntax.object.kind === "property-access" &&
        syntax.object.object.kind === "identifier" &&
        syntax.object.object.name === context.contextName &&
        syntax.object.propertyName === "uniforms"
      ) {
        return lowerDefaultUniform(syntax, context.customUniforms);
      }
      if (
        syntax.object.kind === "identifier" &&
        syntax.object.name === "uniforms" &&
        context.contextBindings.has("uniforms")
      ) {
        return lowerDefaultUniform(syntax, context.customUniforms);
      }
      if (
        syntax.object.kind === "identifier" &&
        syntax.object.name === context.contextName
      ) {
        if (syntax.propertyName === "coord")
          return {
            ok: true,
            expression: {
              kind: "builtin-input",
              input: "fragment-position",
              type: VEC4_F32_TYPE,
              range: syntax.range,
            },
          };
        return expressionFailure(
          ShaderDiagnosticCode.UnsupportedPropertyAccess,
          "Only coord and uniforms are available on the fragment context.",
          syntax.range,
        );
      }
      return lowerSwizzle(syntax, context);

    case "binary-expression":
      return lowerBinaryExpression(syntax, context);

    case "unary-expression": {
      const argument = lowerExpression(syntax.argument, context);
      if (!argument.ok) return argument;
      if (argument.expression.type.kind === "matrix") {
        return expressionFailure(
          ShaderDiagnosticCode.UnsupportedOperator,
          "Unary matrix negation is not supported; use matrix multiplication by -1 instead.",
          syntax.range,
        );
      }
      return {
        ok: true,
        expression: {
          kind: "unary",
          operator: syntax.operator,
          argument: argument.expression,
          type: argument.expression.type,
          range: syntax.range,
        },
      };
    }

    case "call-expression":
      return lowerCallExpression(syntax, context);

    default:
      return assertNever(syntax);
  }
}

function lowerCallExpression(
  syntax: ShaderCallExpressionSyntax,
  context: LoweringContext,
): LowerExpressionResult {
  const name = syntax.calleeName;
  if (name === "sample" && context.sampleCallables.has(name)) {
    if (syntax.arguments.length !== 2) {
      return expressionFailure(
        ShaderDiagnosticCode.InvalidBuiltin,
        `sample requires exactly two arguments; received ${syntax.arguments.length}.`,
        syntax.range,
      );
    }
    const texture = lowerExpression(syntax.arguments[0]!, context);
    if (!texture.ok) return texture;
    const uv = lowerExpression(syntax.arguments[1]!, context);
    if (!uv.ok) return uv;
    const textureName = textureNameOf(
      texture.expression,
      context.localInitializers,
    );
    if (!textureName) {
      return expressionFailure(
        ShaderDiagnosticCode.InvalidBuiltin,
        "sample requires a declared texture handle as its first argument.",
        syntax.arguments[0]!.range,
      );
    }
    if (!isVec2(uv.expression.type)) {
      return expressionFailure(
        ShaderDiagnosticCode.InvalidBuiltin,
        `sample requires an Expr<Vec2<F32>> UV; received ${formatExpressionType(uv.expression.type)}.`,
        syntax.arguments[1]!.range,
      );
    }
    return {
      ok: true,
      expression: {
        kind: "call",
        target: { kind: "texture-sample", textureName },
        arguments: [uv.expression],
        type: VEC4_F32_TYPE,
        range: syntax.range,
      },
    };
  }
  if (
    name !== "vec2" &&
    name !== "vec3" &&
    name !== "vec4" &&
    name !== "mat2" &&
    name !== "mat3" &&
    name !== "mat4" &&
    (!isShaderBuiltinName(name) || !context.importedCallables.has(name)) &&
    !context.functions.has(name)
  ) {
    return expressionFailure(
      ShaderDiagnosticCode.UnsupportedCall,
      `Unsupported shader call ${JSON.stringify(syntax.calleeName)}.`,
      syntax.arguments.length ? syntax.range : syntax.calleeRange,
    );
  }

  const args: ShaderExpression[] = [];
  for (const argument of syntax.arguments) {
    const lowered = lowerExpression(argument, context);
    if (!lowered.ok) return lowered;
    args.push(lowered.expression);
  }

  const helper = context.functions.get(name);
  if (helper) {
    if (
      args.length !== helper.parameters.length ||
      args.some(
        (arg, index) =>
          !sameTypeResult(arg.type, helper.parameters[index]!.type),
      )
    ) {
      return expressionFailure(
        ShaderDiagnosticCode.InvalidShaderFunctionCall,
        `No matching ${JSON.stringify(name)} helper for argument types (${args.map((arg) => formatExpressionType(arg.type)).join(", ")}); expected (${helper.parameters.map((param) => formatExpressionType(param.type)).join(", ")}).`,
        syntax.range,
      );
    }
    return {
      ok: true,
      expression: {
        kind: "call",
        target: {
          kind: "shader-function",
          name,
          functionId: helper.functionId,
        },
        arguments: args,
        type: helper.returnType,
        range: syntax.range,
      },
    };
  }

  if (isShaderBuiltinName(name)) {
    const type = builtinResultType(
      name,
      args.map((arg) => arg.type),
    );
    if (!type) {
      return expressionFailure(
        ShaderDiagnosticCode.InvalidBuiltin,
        `No matching ${JSON.stringify(name)} builtin for argument types (${args.map((arg) => formatExpressionType(arg.type)).join(", ")}).`,
        syntax.range,
      );
    }
    if (name === "smoothstep") {
      const edge0 = evaluateShaderConstant(args[0]!, context.constantLocals);
      const edge1 = evaluateShaderConstant(args[1]!, context.constantLocals);
      const equalIndex =
        edge0 && edge1
          ? edge0.findIndex(
              (component, index) =>
                Number.isFinite(component) && component === edge1[index],
            )
          : -1;
      // If every component is known, finite and distinct, a structural
      // comparison cannot establish equal edges. Avoid walking the DAG.
      const definitelyDistinct =
        edge0 !== undefined &&
        edge1 !== undefined &&
        edge0.length === edge1.length &&
        edge0.every(
          (value, index) =>
            Number.isFinite(value) &&
            Number.isFinite(edge1[index]) &&
            value !== edge1[index],
        );
      if (
        equalIndex >= 0 ||
        (!definitelyDistinct &&
          identicalConstantExpressions(
            args[0]!,
            args[1]!,
            context.localInitializers,
          ))
      ) {
        return expressionFailure(
          ShaderDiagnosticCode.InvalidBuiltinDomain,
          `smoothstep requires distinct edges in every component; ${type.kind === "vector" ? `component ${Math.max(0, equalIndex)} has` : "edges have"} known edge0 == edge1.`,
          syntax.range,
        );
      }
    }
    const domainError = invalidBuiltinDomain(name, args, context);
    if (domainError) {
      return expressionFailure(
        ShaderDiagnosticCode.InvalidBuiltinDomain,
        domainError,
        syntax.range,
      );
    }
    return {
      ok: true,
      expression: {
        kind: "call",
        target: { kind: "builtin-function", name },
        arguments: args,
        type,
        range: syntax.range,
      },
    };
  }

  if (
    name !== "vec2" &&
    name !== "vec3" &&
    name !== "vec4" &&
    name !== "mat2" &&
    name !== "mat3" &&
    name !== "mat4"
  ) {
    return expressionFailure(
      ShaderDiagnosticCode.UnsupportedCall,
      `Unsupported shader call ${JSON.stringify(name)}.`,
      syntax.calleeRange,
    );
  }
  if (!isConstructorArguments(name, args)) {
    const texture = args.find((argument) => argument.kind === "texture");
    if (texture?.kind === "texture") {
      return expressionFailure(
        ShaderDiagnosticCode.InvalidUniform,
        `Texture uniform ${JSON.stringify(texture.name)} cannot be used as a numeric expression.`,
        texture.range,
      );
    }
    const argumentTypes = args
      .map((argument) => formatExpressionType(argument.type))
      .join(", ");
    return expressionFailure(
      ShaderDiagnosticCode.InvalidConstructor,
      `No matching ${JSON.stringify(syntax.calleeName)} constructor for argument types (${argumentTypes}).`,
      syntax.range,
    );
  }

  return {
    ok: true,
    expression: {
      kind: "call",
      target: { kind: "constructor", name },
      arguments: args,
      type:
        name === "vec2"
          ? VEC2_F32_TYPE
          : name === "vec3"
            ? VEC3_F32_TYPE
            : name === "vec4"
              ? VEC4_F32_TYPE
              : name === "mat2"
                ? MAT2_F32_TYPE
                : name === "mat3"
                  ? MAT3_F32_TYPE
                  : MAT4_F32_TYPE,
      range: syntax.range,
    },
  };
}

function invalidBuiltinDomain(
  name: string,
  args: readonly ShaderExpression[],
  context: LoweringContext,
): string | undefined {
  if (
    name !== "asin" &&
    name !== "acos" &&
    name !== "radians" &&
    name !== "degrees" &&
    name !== "atan" &&
    name !== "mod" &&
    name !== "sqrt" &&
    name !== "exp" &&
    name !== "tanh" &&
    name !== "clamp" &&
    name !== "pow"
  )
    return undefined;
  const values = args.map((arg) =>
    evaluateShaderComponents(arg, context.constantLocals),
  );
  if (hasKnownNonFiniteSubexpression(args, context))
    return `${name} has a known non-finite f32 argument.`;
  const [first, second, third] = values;
  if (
    name === "mod" &&
    second?.some((value) => value !== undefined && value === 0)
  )
    return "mod requires a nonzero divisor in every component.";
  if (
    (name === "asin" || name === "acos") &&
    first?.some((value) => value !== undefined && (value < -1 || value > 1))
  )
    return `${name} requires inputs in the range [-1, 1] in every component.`;
  if (
    name === "degrees" &&
    first?.some(
      (value) => value !== undefined && Math.abs(value) > MAX_F32 / 57,
    )
  )
    // 180 / pi is greater than 57; this conservative bound only rejects
    // values whose degree conversion is clearly outside finite f32 range.
    return "degrees has a known result outside the finite f32 range.";
  if (
    name === "sqrt" &&
    first?.some((value) => value !== undefined && value < 0)
  )
    return "sqrt requires nonnegative inputs in every component.";
  if (
    name === "exp" &&
    first?.some((value) => value !== undefined && value >= 89)
  )
    // ln(MAX_F32) is ~88.72; 89 is safely beyond the boundary.
    return "exp has a known result outside the finite f32 range.";
  if (
    name === "clamp" &&
    first &&
    second &&
    third &&
    first.some((_, index) => {
      const low = componentAt(second, index);
      const high = componentAt(third, index);
      return low !== undefined && high !== undefined && low > high;
    })
  )
    return "clamp requires low <= high in every component.";
  if (name === "pow" && first) {
    if (first.some((base) => base !== undefined && base < 0))
      return "pow requires nonnegative bases in every component.";
    if (
      second &&
      first.some((base, index) => {
        const exponent = componentAt(second, index);
        return base === 0 && exponent !== undefined && exponent <= 0;
      })
    )
      return "pow requires a positive exponent when a base is zero.";
    if (
      second &&
      first.some((base, index) => {
        const exponent = componentAt(second, index);
        return (
          base !== undefined &&
          base > 0 &&
          exponent !== undefined &&
          knownPowOverflow(base, exponent)
        );
      })
    )
      return "pow has a known result outside the finite f32 range.";
  }
  return undefined;
}

function hasKnownNonFiniteSubexpression(
  arguments_: readonly ShaderExpression[],
  context: LoweringContext,
): boolean {
  const pending = [...arguments_];
  const seen = new WeakSet<ShaderExpression>();
  const cache = new WeakMap<ShaderExpression, ShaderKnownComponents>();
  const seenLocals = new Set<ShaderLocalSymbolId>();
  while (pending.length) {
    const expression = pending.pop()!;
    if (seen.has(expression)) continue;
    seen.add(expression);
    if (
      evaluateShaderComponents(expression, context.constantLocals, cache).some(
        (value) => value !== undefined && !Number.isFinite(value),
      )
    )
      return true;
    switch (expression.kind) {
      case "local-reference": {
        if (seenLocals.has(expression.symbolId)) break;
        seenLocals.add(expression.symbolId);
        const initializer = context.localInitializers.get(expression.symbolId);
        if (initializer) pending.push(initializer);
        break;
      }
      case "binary":
        pending.push(expression.left, expression.right);
        break;
      case "unary":
        pending.push(expression.argument);
        break;
      case "swizzle":
        pending.push(expression.expression);
        break;
      case "call":
        pending.push(...expression.arguments);
        break;
      case "numeric-literal":
      case "builtin-input":
      case "default-uniform":
      case "custom-uniform":
      case "texture":
        break;
      default:
        assertNever(expression);
    }
  }
  return false;
}

function componentAt(
  components: ShaderKnownComponents | undefined,
  index: number,
): number | undefined {
  if (!components) return undefined;
  return components[components.length === 1 ? 0 : index];
}

function knownPowOverflow(base: number, exponent: number): boolean {
  // Integer bases and exponents admit an exact comparison with finite f32's
  // integer maximum. Avoid huge BigInt work for unbounded authored exponents.
  if (
    Number.isInteger(base) &&
    Number.isInteger(exponent) &&
    base >= 2 &&
    exponent >= 0 &&
    exponent <= 256
  )
    return BigInt(base) ** BigInt(exponent) > BigInt(MAX_F32);
  // ln(MAX_F32) ~88.72. A small margin keeps approximate log proofs away
  // from the boundary, without admitting clear overflow like 2^130.
  return Math.log(base) * exponent > Math.log(MAX_F32) + 0.1;
}

function isConstructorArguments(
  name: "vec2" | "vec3" | "vec4" | "mat2" | "mat3" | "mat4",
  args: readonly ShaderExpression[],
): boolean {
  const size =
    name === "vec2" || name === "mat2"
      ? 2
      : name === "vec3" || name === "mat3"
        ? 3
        : 4;
  if (name.startsWith("mat")) {
    if (args.length === 1) {
      const value = args[0];
      return (
        value !== undefined &&
        (isF32(value.type) ||
          (value.type.kind === "matrix" &&
            value.type.columns === size &&
            value.type.rows === size))
      );
    }
    if (
      args.length === size &&
      args.every((arg) => arg.type.kind === "vector" && arg.type.size === size)
    )
      return true;
    return args.length === size * size && args.every((arg) => isF32(arg.type));
  }
  if (args.length === 1) {
    const value = args[0];
    return (
      value !== undefined &&
      (isF32(value.type) ||
        (value.type.kind === "vector" && value.type.size === size))
    );
  }
  if (args.length === size && args.every((arg) => isF32(arg.type))) return true;
  if (args.length === 2 && (name === "vec3" || name === "vec4")) {
    const [head, tail] = args;
    return (
      head?.type.kind === "vector" &&
      head.type.size === size - 1 &&
      tail !== undefined &&
      isF32(tail.type)
    );
  }
  if (name !== "vec4" || args.length !== 3) return false;
  const [xy, z, w] = args;
  return (
    xy?.type.kind === "vector" &&
    xy.type.size === 2 &&
    z !== undefined &&
    isF32(z.type) &&
    w !== undefined &&
    isF32(w.type)
  );
}

function isVec2(type: ShaderValueType): boolean {
  return type.kind === "vector" && type.scalar === "f32" && type.size === 2;
}

function isVec4(type: ShaderValueType): boolean {
  return type.kind === "vector" && type.scalar === "f32" && type.size === 4;
}

function isF32(type: ShaderValueType): boolean {
  return type.kind === "scalar" && type.scalar === "f32";
}

function lowerBinaryExpression(
  syntax: ShaderBinaryExpressionSyntax,
  context: LoweringContext,
): LowerExpressionResult {
  const left = lowerExpression(syntax.left, context);
  if (!left.ok) return left;

  const right = lowerExpression(syntax.right, context);
  if (!right.ok) return right;

  let type: ShaderValueType | undefined;
  switch (syntax.operator) {
    case "+":
    case "-":
      type = additionResult(left.expression.type, right.expression.type);
      break;
    case "*":
      type = multiplicationResult(left.expression.type, right.expression.type);
      break;
    case "/":
      type = divisionResult(left.expression.type, right.expression.type);
      break;
    default:
      return assertNever(syntax.operator);
  }

  if (!type) {
    return expressionFailure(
      ShaderDiagnosticCode.InvalidBinaryOperation,
      `Operator ${JSON.stringify(syntax.operator)} cannot be applied to types ${JSON.stringify(formatExpressionType(left.expression.type))} and ${JSON.stringify(formatExpressionType(right.expression.type))}.`,
      syntax.range,
    );
  }

  return {
    ok: true,
    expression: {
      kind: "binary",
      operator: syntax.operator,
      left: left.expression,
      right: right.expression,
      type,
      range: syntax.range,
    },
  };
}

function sameTypeResult(
  left: ShaderValueType,
  right: ShaderValueType,
): ShaderValueType | undefined {
  return sameShaderValueType(left, right) ? left : undefined;
}

function additionResult(
  left: ShaderValueType,
  right: ShaderValueType,
): ShaderValueType | undefined {
  if (left.kind === "matrix" || right.kind === "matrix") {
    return left.kind === "matrix" &&
      right.kind === "matrix" &&
      sameShaderValueType(left, right)
      ? left
      : undefined;
  }
  if (isF32(left) && right.kind === "vector") return right;
  if (isF32(right) && left.kind === "vector") return left;
  return sameTypeResult(left, right);
}

function multiplicationResult(
  left: ShaderValueType,
  right: ShaderValueType,
): ShaderValueType | undefined {
  if (left.kind === "matrix") {
    if (isF32(right)) return left;
    if (
      right.kind === "vector" &&
      right.size === left.columns &&
      left.columns === left.rows
    )
      return right;
    if (
      right.kind === "matrix" &&
      right.columns === left.columns &&
      right.rows === left.rows
    )
      return left;
    return undefined;
  }
  if (right.kind === "matrix") {
    if (isF32(left)) return right;
    if (
      left.kind === "vector" &&
      left.size === right.rows &&
      right.columns === right.rows
    )
      return left;
    return undefined;
  }
  if (isF32(left)) return isF32(right) ? F32_TYPE : undefined;
  if (left.kind !== "vector") return undefined;
  return isF32(right) || (right.kind === "vector" && right.size === left.size)
    ? left
    : undefined;
}

function divisionResult(
  left: ShaderValueType,
  right: ShaderValueType,
): ShaderValueType | undefined {
  if (isF32(left)) return isF32(right) ? F32_TYPE : undefined;
  if (left.kind !== "vector") return undefined;
  return isF32(right) || (right.kind === "vector" && right.size === left.size)
    ? left
    : undefined;
}

function formatExpressionType(type: ShaderValueType): string {
  return `Expr<${formatShaderType(type)}>`;
}

function textureNameOf(
  expression: ShaderExpression,
  localInitializers: ReadonlyMap<ShaderLocalSymbolId, ShaderExpression>,
): string | undefined {
  if (expression.kind === "texture") return expression.name;
  if (expression.kind !== "local-reference") return undefined;
  const initializer = localInitializers.get(expression.symbolId);
  return initializer
    ? textureNameOf(initializer, localInitializers)
    : undefined;
}

function lowerSwizzle(
  syntax: ShaderPropertyAccessSyntax,
  context: LoweringContext,
): LowerExpressionResult {
  const object = lowerExpression(syntax.object, context);
  if (!object.ok) return object;

  const objectType = object.expression.type;
  if (objectType.kind !== "vector") {
    return expressionFailure(
      ShaderDiagnosticCode.InvalidSwizzle,
      `Cannot apply swizzle ${JSON.stringify(`.${syntax.propertyName}`)} to scalar type ${JSON.stringify(formatShaderType(objectType))}.`,
      syntax.propertyRange,
    );
  }

  const components = parseVectorComponents(syntax.propertyName);
  if (!components) {
    return expressionFailure(
      ShaderDiagnosticCode.InvalidSwizzle,
      `Swizzle ${JSON.stringify(`.${syntax.propertyName}`)} is not supported; use one to four xyzw or rgba components without mixing alphabets.`,
      syntax.propertyRange,
    );
  }

  if (components.some((component) => component >= objectType.size)) {
    return expressionFailure(
      ShaderDiagnosticCode.InvalidSwizzle,
      `Swizzle ${JSON.stringify(`.${syntax.propertyName}`)} is not available on type ${JSON.stringify(formatShaderType(objectType))}.`,
      syntax.propertyRange,
    );
  }

  return {
    ok: true,
    expression: {
      kind: "swizzle",
      expression: object.expression,
      components,
      type: swizzleType(components),
      range: syntax.range,
    },
  };
}

function parseVectorComponents(
  propertyName: string,
): ShaderSwizzleComponents | undefined {
  if (propertyName.length < 1 || propertyName.length > 4) return undefined;

  const alphabet = /^[xyzw]+$/.test(propertyName)
    ? "xyzw"
    : /^[rgba]+$/.test(propertyName)
      ? "rgba"
      : undefined;
  if (!alphabet) return undefined;

  const first = vectorComponent(propertyName[0], alphabet);
  if (first === undefined) return undefined;
  if (propertyName.length === 1) return [first];

  const second = vectorComponent(propertyName[1], alphabet);
  if (second === undefined) return undefined;
  if (propertyName.length === 2) return [first, second];

  const third = vectorComponent(propertyName[2], alphabet);
  if (third === undefined) return undefined;
  if (propertyName.length === 3) return [first, second, third];

  const fourth = vectorComponent(propertyName[3], alphabet);
  return fourth === undefined ? undefined : [first, second, third, fourth];
}

function vectorComponent(
  component: string | undefined,
  alphabet: "xyzw" | "rgba",
): ShaderVectorComponent | undefined {
  if (component === undefined) return undefined;
  const index = alphabet.indexOf(component);
  return index < 0 ? undefined : (index as ShaderVectorComponent);
}

function swizzleType(components: ShaderSwizzleComponents): ShaderValueType {
  if (components.length === 1) return F32_TYPE;
  return { kind: "vector", scalar: "f32", size: components.length };
}

function formatShaderType(type: ShaderValueType): string {
  if (type.kind === "scalar") return "F32";
  if (type.kind === "vector") return `Vec${type.size}<F32>`;
  if (type.kind === "matrix") return `Mat${type.columns}x${type.rows}<F32>`;
  return "Texture2D";
}

function lowerDefaultUniform(
  syntax: ShaderPropertyAccessSyntax,
  customUniforms: ReadonlyMap<
    string,
    ShaderCustomUniformDeclaration | ShaderTextureDeclaration
  >,
): LowerExpressionResult {
  let uniform: ShaderDefaultUniform;
  let type: ShaderValueType;

  switch (syntax.propertyName) {
    case "resolution":
      uniform = "resolution";
      type = VEC2_F32_TYPE;
      break;
    case "mouse":
      uniform = "mouse";
      type = VEC2_F32_TYPE;
      break;
    case "time":
      uniform = "time";
      type = F32_TYPE;
      break;
    default: {
      const custom = customUniforms.get(syntax.propertyName);
      if (custom?.type === "texture2D")
        return {
          ok: true,
          expression: {
            kind: "texture",
            name: custom.name,
            type: TEXTURE_2D_TYPE as never,
            range: syntax.range,
          },
        };
      if (custom)
        return {
          ok: true,
          expression: {
            kind: "custom-uniform",
            name: custom.name,
            type: customType(custom.type),
            range: syntax.range,
          },
        };
      return expressionFailure(
        ShaderDiagnosticCode.InvalidUniform,
        `Unknown ${customUniforms.size ? "uniform" : "default uniform"} ${JSON.stringify(syntax.propertyName)}.`,
        syntax.propertyRange,
      );
    }
  }

  const expression: ShaderDefaultUniformExpression = {
    kind: "default-uniform",
    uniform,
    type,
    range: syntax.range,
  };
  return { ok: true, expression };
}

function customType(type: ShaderCustomUniformType): ShaderValueType {
  switch (type) {
    case "f32":
      return F32_TYPE;
    case "vec2":
      return VEC2_F32_TYPE;
    case "vec3":
      return VEC3_F32_TYPE;
    case "vec4":
      return VEC4_F32_TYPE;
    default:
      return assertNever(type);
  }
}

function expressionFailure(
  code: ShaderDiagnostic["code"],
  message: string,
  range: TextRange,
): LowerExpressionResult {
  return { ok: false, diagnostic: diagnostic(code, message, range) };
}

function failure(diagnosticValue: ShaderDiagnostic): LowerShaderSyntaxFailure {
  return { ok: false, diagnostics: [diagnosticValue] };
}

function diagnostic(
  code: ShaderDiagnostic["code"],
  message: string,
  range: TextRange,
): ShaderDiagnostic {
  return { code, message, range, severity: "error" };
}

function assertNever(value: never): never {
  throw new Error(
    `Unhandled normalized shader syntax: ${JSON.stringify(value)}`,
  );
}
