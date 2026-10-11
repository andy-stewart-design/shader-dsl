import { ShaderDiagnosticCode, type ShaderDiagnostic } from "./diagnostics.js";
import { lowerShaderBody } from "./lower-shader-syntax.js";
import type {
  ShaderFunction,
  ShaderExpression,
  ShaderStatement,
} from "./shader-ir.js";
import type {
  ShaderFunctionSyntax,
  ShaderExpressionSyntax,
  ShaderCallExpressionSyntax,
} from "./shader-syntax.js";

/** Validates every definition once, with parameters dynamic for domain analysis. */
export function lowerShaderFunctions(
  definitions: readonly ShaderFunctionSyntax[],
  importedCallables: ReadonlySet<string>,
):
  | {
      readonly ok: true;
      readonly functions: ReadonlyMap<string, ShaderFunction>;
      readonly diagnostics: readonly [];
    }
  | { readonly ok: false; readonly diagnostics: readonly ShaderDiagnostic[] } {
  const source = new Map(
    definitions.map((definition, index) => [
      definition.name,
      { definition, index },
    ]),
  );
  const functions = new Map<string, ShaderFunction>();
  const active: string[] = [];
  const callableNames = new Set([...importedCallables, ...source.keys()]);
  let error: ShaderDiagnostic | undefined;

  const lower = (name: string, call?: ShaderCallExpressionSyntax): boolean => {
    if (functions.has(name)) return true;
    if (active.includes(name)) {
      error = {
        code: ShaderDiagnosticCode.RecursiveShaderFunction,
        message: `Recursive shader helpers are unsupported: ${[...active.slice(active.indexOf(name)), name].join(" → ")}.`,
        range: call!.range,
        severity: "error",
      };
      return false;
    }
    const { definition, index } = source.get(name)!;
    active.push(name);
    for (const expression of [
      ...definition.body.declarations.map(
        (declaration) => declaration.initializer,
      ),
      definition.body.returnExpression,
    ]) {
      for (const dependency of syntaxCalls(expression)) {
        if (
          source.has(dependency.calleeName) &&
          !lower(dependency.calleeName, dependency)
        )
          return false;
      }
    }
    const parameters = definition.parameters.map((parameter, symbolId) => ({
      ...parameter,
      symbolId,
    }));
    const result = lowerShaderBody(definition.body, callableNames, [], {
      parameters,
      functions,
    });
    if (!result.ok) {
      error = result.diagnostics[0]!;
      return false;
    }
    const returnType = result.returnType;
    if (
      definition.returnType &&
      (definition.returnType.kind !== returnType.kind ||
        (definition.returnType.kind === "vector" &&
          (returnType.kind !== "vector" ||
            definition.returnType.size !== returnType.size)))
    ) {
      error = {
        code: ShaderDiagnosticCode.InvalidReturnType,
        message: `Helper ${JSON.stringify(name)} return expression does not match its annotated return type.`,
        range: definition.body.returnExpression.range,
        severity: "error",
      };
      return false;
    }
    functions.set(name, {
      name,
      functionId: index,
      parameters,
      returnType,
      statements: result.statements,
      range: definition.range,
    });
    active.pop();
    return true;
  };
  for (const definition of definitions) {
    if (!lower(definition.name)) return { ok: false, diagnostics: [error!] };
  }
  return { ok: true, functions, diagnostics: [] };
}

/** Input map is already dependency-ordered; keep only entry-reachable functions. */
export function reachableShaderFunctions(
  statements: readonly ShaderStatement[],
  functions: ReadonlyMap<string, ShaderFunction>,
): readonly ShaderFunction[] {
  const ids = new Set<number>();
  const byId = new Map(
    [...functions.values()].map((helper) => [helper.functionId, helper]),
  );
  const visitExpression = (expression: ShaderExpression): void => {
    switch (expression.kind) {
      case "call":
        if (
          expression.target.kind === "shader-function" &&
          !ids.has(expression.target.functionId)
        ) {
          ids.add(expression.target.functionId);
          visitStatements(byId.get(expression.target.functionId)!.statements);
        }
        expression.arguments.forEach(visitExpression);
        break;
      case "binary":
        visitExpression(expression.left);
        visitExpression(expression.right);
        break;
      case "unary":
        visitExpression(expression.argument);
        break;
      case "swizzle":
        visitExpression(expression.expression);
        break;
      case "numeric-literal":
      case "builtin-input":
      case "local-reference":
      case "default-uniform":
      case "custom-uniform":
        break;
      default:
        assertNever(expression);
    }
  };
  const visitStatements = (items: readonly ShaderStatement[]): void => {
    for (const item of items)
      visitExpression(
        item.kind === "const-declaration" ? item.initializer : item.expression,
      );
  };
  visitStatements(statements);
  return [...functions.values()].filter((helper) => ids.has(helper.functionId));
}

function syntaxCalls(
  expression: ShaderExpressionSyntax,
): readonly ShaderCallExpressionSyntax[] {
  switch (expression.kind) {
    case "call-expression":
      return [expression, ...expression.arguments.flatMap(syntaxCalls)];
    case "binary-expression":
      return [
        ...syntaxCalls(expression.left),
        ...syntaxCalls(expression.right),
      ];
    case "unary-expression":
      return syntaxCalls(expression.argument);
    case "parenthesized-expression":
      return syntaxCalls(expression.expression);
    case "property-access":
      return syntaxCalls(expression.object);
    case "identifier":
    case "numeric-literal":
      return [];
    default:
      return assertNever(expression);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected helper expression: ${JSON.stringify(value)}`);
}
