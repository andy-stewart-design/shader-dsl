import { ShaderDiagnosticCode, type ShaderDiagnostic } from "./diagnostics.js";
import type {
  ShaderConstDeclaration,
  ShaderDefaultUniform,
  ShaderDefaultUniformExpression,
  ShaderExpression,
  ShaderLocalSymbolId,
  ShaderModule,
  ShaderSwizzleComponents,
  ShaderVectorComponent,
} from "./shader-ir.js";
import type {
  ShaderBinaryExpressionSyntax,
  ShaderCallbackSyntax,
  ShaderCallExpressionSyntax,
  ShaderExpressionSyntax,
  ShaderPropertyAccessSyntax,
} from "./shader-syntax.js";
import type {
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
}

type LowerExpressionResult =
  | { readonly ok: true; readonly expression: ShaderExpression }
  | { readonly ok: false; readonly diagnostic: ShaderDiagnostic };

/** Lowers normalized callback syntax without consulting a target backend. */
export function lowerShaderSyntax(
  syntax: ShaderCallbackSyntax,
): LowerShaderSyntaxResult {
  const locals = new Map<string, LocalBinding>();
  const futureNames = new Set(
    syntax.declarations.map((declaration) => declaration.name),
  );
  const statements: ShaderConstDeclaration[] = [];
  let nextSymbolId = 0;

  for (const declaration of syntax.declarations) {
    if (
      CONTEXT_BINDING_NAMES.has(declaration.name) ||
      locals.has(declaration.name)
    ) {
      return failure(
        diagnostic(
          ShaderDiagnosticCode.DuplicateLocal,
          CONTEXT_BINDING_NAMES.has(declaration.name)
            ? `Shader local ${JSON.stringify(declaration.name)} conflicts with a shader context binding.`
            : `Shader local ${JSON.stringify(declaration.name)} is declared more than once.`,
          declaration.nameRange,
        ),
      );
    }

    const initializer = lowerExpression(declaration.initializer, {
      locals,
      futureNames,
    });
    if (!initializer.ok) return failure(initializer.diagnostic);

    const symbolId = nextSymbolId;
    nextSymbolId += 1;
    futureNames.delete(declaration.name);
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
  });
  if (!returned.ok) return failure(returned.diagnostic);
  if (!isVec4(returned.expression.type)) {
    return failure(
      diagnostic(
        ShaderDiagnosticCode.InvalidReturnType,
        `Fragment shaders must return "Expr<Vec4<F32>>"; received ${JSON.stringify(formatExpressionType(returned.expression.type))}.`,
        syntax.returnExpression.range,
      ),
    );
  }

  return {
    ok: true,
    module: {
      kind: "shader-module",
      stage: "fragment",
      statements: [
        ...statements,
        {
          kind: "return-statement",
          expression: returned.expression,
          range: syntax.returnRange,
        },
      ],
      range: syntax.range,
    },
    diagnostics: [],
  };
}

function lowerExpression(
  syntax: ShaderExpressionSyntax,
  context: LoweringContext,
): LowerExpressionResult {
  switch (syntax.kind) {
    case "numeric-literal":
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
      if (syntax.name === "coord") {
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

      if (syntax.name === "uniforms") {
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
        syntax.object.kind === "identifier" &&
        syntax.object.name === "uniforms"
      ) {
        return lowerDefaultUniform(syntax);
      }
      return lowerSwizzle(syntax, context);

    case "binary-expression":
      return lowerBinaryExpression(syntax, context);

    case "unary-expression": {
      const argument = lowerExpression(syntax.argument, context);
      if (!argument.ok) return argument;
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
  if (name !== "vec2" && name !== "vec3" && name !== "vec4") {
    return expressionFailure(
      ShaderDiagnosticCode.UnsupportedCall,
      `Unsupported shader call ${JSON.stringify(syntax.calleeName)}; supported constructors are "vec2", "vec3", and "vec4".`,
      syntax.calleeRange,
    );
  }

  const args: ShaderExpression[] = [];
  for (const argument of syntax.arguments) {
    const lowered = lowerExpression(argument, context);
    if (!lowered.ok) return lowered;
    args.push(lowered.expression);
  }

  if (!isConstructorArguments(name, args)) {
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
            : VEC4_F32_TYPE,
      range: syntax.range,
    },
  };
}

function isConstructorArguments(
  name: "vec2" | "vec3" | "vec4",
  args: readonly ShaderExpression[],
): boolean {
  const size = name === "vec2" ? 2 : name === "vec3" ? 3 : 4;
  if (args.length === 1) {
    const value = args[0];
    return (
      value !== undefined &&
      (isF32(value.type) ||
        (value.type.kind === "vector" && value.type.size === size))
    );
  }
  if (args.length === size && args.every((arg) => isF32(arg.type))) return true;
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
      type = sameTypeResult(left.expression.type, right.expression.type);
      break;
    case "*":
    case "/":
      type = vectorScalarResult(left.expression.type, right.expression.type);
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
  if (isF32(left)) return isF32(right) ? F32_TYPE : undefined;
  return left.kind === "vector" &&
    right.kind === "vector" &&
    left.size === right.size
    ? left
    : undefined;
}

function vectorScalarResult(
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
      `Swizzle ${JSON.stringify(`.${syntax.propertyName}`)} is not supported; use one to four xyzw components.`,
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

  const first = vectorComponent(propertyName[0]);
  if (first === undefined) return undefined;
  if (propertyName.length === 1) return [first];

  const second = vectorComponent(propertyName[1]);
  if (second === undefined) return undefined;
  if (propertyName.length === 2) return [first, second];

  const third = vectorComponent(propertyName[2]);
  if (third === undefined) return undefined;
  if (propertyName.length === 3) return [first, second, third];

  const fourth = vectorComponent(propertyName[3]);
  return fourth === undefined ? undefined : [first, second, third, fourth];
}

function vectorComponent(
  component: string | undefined,
): ShaderVectorComponent | undefined {
  switch (component) {
    case "x":
      return 0;
    case "y":
      return 1;
    case "z":
      return 2;
    case "w":
      return 3;
    default:
      return undefined;
  }
}

function swizzleType(components: ShaderSwizzleComponents): ShaderValueType {
  if (components.length === 1) return F32_TYPE;
  return { kind: "vector", scalar: "f32", size: components.length };
}

function formatShaderType(type: ShaderValueType): string {
  return type.kind === "scalar" ? "F32" : `Vec${type.size}<F32>`;
}

function lowerDefaultUniform(
  syntax: ShaderPropertyAccessSyntax,
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
    default:
      return expressionFailure(
        ShaderDiagnosticCode.InvalidUniform,
        `Unknown default uniform ${JSON.stringify(syntax.propertyName)}.`,
        syntax.propertyRange,
      );
  }

  const expression: ShaderDefaultUniformExpression = {
    kind: "default-uniform",
    uniform,
    type,
    range: syntax.range,
  };
  return { ok: true, expression };
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
