import { ShaderDiagnosticCode, type ShaderDiagnostic } from "./diagnostics.js";
import type {
  ShaderConstDeclaration,
  ShaderDefaultUniform,
  ShaderDefaultUniformExpression,
  ShaderExpression,
  ShaderLocalSymbolId,
  ShaderModule,
} from "./shader-ir.js";
import type {
  ShaderCallbackSyntax,
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
      return expressionFailure(
        ShaderDiagnosticCode.UnsupportedPropertyAccess,
        "Swizzle semantic lowering is not available yet.",
        syntax.range,
      );

    case "binary-expression":
      return expressionFailure(
        ShaderDiagnosticCode.UnsupportedOperator,
        "Binary-operation semantic lowering is not available yet.",
        syntax.range,
      );

    case "call-expression":
      return expressionFailure(
        ShaderDiagnosticCode.UnsupportedCall,
        "Shader-call semantic lowering is not available yet.",
        syntax.range,
      );

    default:
      return assertNever(syntax);
  }
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
