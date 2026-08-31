import type {
  ArrowFunctionExpression,
  Expression,
  Node,
  ReturnStatement,
  VariableDeclaration,
} from "@babel/types";

import { ShaderDiagnosticCode, type ShaderDiagnostic } from "./diagnostics.js";
import type { TextRange } from "./source-range.js";

const SUPPORTED_PROPERTY_NAMES = new Set([
  "mouse",
  "resolution",
  "time",
  "x",
  "xy",
  "y",
]);

export function validateShaderSyntax(
  callback: ArrowFunctionExpression,
  calleeNames: ReadonlySet<string>,
): readonly ShaderDiagnostic[] {
  const annotation = callback.returnType ?? callback.typeParameters;
  if (annotation) {
    return [typeAnnotationDiagnostic(annotation)];
  }

  const parameter = callback.params[0];
  if (parameter?.type === "ObjectPattern" && parameter.typeAnnotation) {
    return [typeAnnotationDiagnostic(parameter.typeAnnotation)];
  }

  if (callback.body.type !== "BlockStatement") {
    return [
      diagnostic(
        ShaderDiagnosticCode.UnsupportedExpression,
        "Expression-bodied callbacks are not supported.",
        callback.body,
      ),
    ];
  }

  const statements = callback.body.body;
  const returnStatements = statements.filter(
    (statement): statement is ReturnStatement =>
      statement.type === "ReturnStatement",
  );

  if (returnStatements.length === 0) {
    return [
      diagnostic(
        ShaderDiagnosticCode.InvalidReturn,
        "The shader callback requires one final return statement.",
        callback.body,
      ),
    ];
  }

  if (returnStatements.length > 1) {
    return [
      diagnostic(
        ShaderDiagnosticCode.InvalidReturn,
        "The shader callback supports exactly one return statement.",
        returnStatements[1]!,
      ),
    ];
  }

  const returnStatement = returnStatements[0]!;
  if (statements.at(-1) !== returnStatement) {
    return [
      diagnostic(
        ShaderDiagnosticCode.InvalidReturn,
        "The return statement must be the final shader statement.",
        returnStatement,
      ),
    ];
  }

  if (!returnStatement.argument) {
    return [
      diagnostic(
        ShaderDiagnosticCode.InvalidReturn,
        "The final return statement requires a shader expression.",
        returnStatement,
      ),
    ];
  }

  const localNames = new Set(["coord", "uniforms"]);

  for (const statement of statements) {
    if (statement.type !== "VariableDeclaration") continue;

    for (const declarator of statement.declarations) {
      if (declarator.id.type === "Identifier") {
        localNames.add(declarator.id.name);
      }
    }
  }

  for (const statement of statements.slice(0, -1)) {
    if (statement.type === "VariableDeclaration") {
      const declarationDiagnostic = validateVariableDeclaration(
        statement,
        localNames,
        calleeNames,
      );
      if (declarationDiagnostic) return [declarationDiagnostic];
      continue;
    }

    if (
      statement.type === "FunctionDeclaration" ||
      statement.type === "ClassDeclaration"
    ) {
      return [
        diagnostic(
          ShaderDiagnosticCode.NestedFunction,
          "Nested function and class declarations are not supported in shaders.",
          statement,
        ),
      ];
    }

    if (
      statement.type === "ExpressionStatement" &&
      statement.expression.type === "AssignmentExpression"
    ) {
      return [assignmentDiagnostic(statement.expression)];
    }

    return [
      diagnostic(
        ShaderDiagnosticCode.UnsupportedStatement,
        `The ${statement.type} statement is not supported in shaders.`,
        statement,
      ),
    ];
  }

  const expressionDiagnostic = validateExpression(
    returnStatement.argument,
    localNames,
    calleeNames,
  );

  return expressionDiagnostic ? [expressionDiagnostic] : [];
}

function validateVariableDeclaration(
  declaration: VariableDeclaration,
  localNames: ReadonlySet<string>,
  calleeNames: ReadonlySet<string>,
): ShaderDiagnostic | undefined {
  if (declaration.kind !== "const") {
    return diagnostic(
      ShaderDiagnosticCode.InvalidVariableDeclaration,
      "Shader variables must use const declarations.",
      declaration,
    );
  }

  if (declaration.declarations.length !== 1) {
    return diagnostic(
      ShaderDiagnosticCode.InvalidVariableDeclaration,
      "Each shader const declaration must declare exactly one variable.",
      declaration,
    );
  }

  const declarator = declaration.declarations[0]!;
  if (declarator.id.type !== "Identifier") {
    return diagnostic(
      ShaderDiagnosticCode.InvalidVariableDeclaration,
      "Shader const declarations require a simple identifier.",
      declarator.id,
    );
  }

  if (declarator.id.typeAnnotation) {
    return typeAnnotationDiagnostic(declarator.id.typeAnnotation);
  }

  if (!declarator.init) {
    return diagnostic(
      ShaderDiagnosticCode.InvalidVariableDeclaration,
      "Shader const declarations require an initializer.",
      declarator,
    );
  }

  return validateExpression(declarator.init, localNames, calleeNames);
}

function validateExpression(
  expression: Expression,
  localNames: ReadonlySet<string>,
  calleeNames: ReadonlySet<string>,
): ShaderDiagnostic | undefined {
  switch (expression.type) {
    case "NumericLiteral":
      return undefined;

    case "Identifier":
      if (localNames.has(expression.name)) return undefined;
      return diagnostic(
        ShaderDiagnosticCode.ClosureCapture,
        `Shader expressions cannot capture the outer identifier ${JSON.stringify(expression.name)}.`,
        expression,
      );

    case "ParenthesizedExpression":
      return validateExpression(expression.expression, localNames, calleeNames);

    case "BinaryExpression":
      if (expression.operator !== "/") {
        return diagnostic(
          ShaderDiagnosticCode.UnsupportedOperator,
          `The ${JSON.stringify(expression.operator)} binary operator is not supported; the POC supports only division.`,
          expression,
        );
      }
      return (
        validateExpression(expression.left, localNames, calleeNames) ??
        validateExpression(expression.right, localNames, calleeNames)
      );

    case "CallExpression": {
      if (
        expression.callee.type !== "Identifier" ||
        !calleeNames.has(expression.callee.name)
      ) {
        return diagnostic(
          ShaderDiagnosticCode.UnsupportedCall,
          "Only direct calls to imported shader constructors are supported.",
          expression,
        );
      }

      if (expression.typeArguments) {
        return typeAnnotationDiagnostic(expression.typeArguments);
      }

      for (const argument of expression.arguments) {
        if (
          argument.type === "SpreadElement" ||
          argument.type === "ArgumentPlaceholder"
        ) {
          return diagnostic(
            ShaderDiagnosticCode.UnsupportedCall,
            "Spread and placeholder constructor arguments are not supported.",
            argument,
          );
        }

        const argumentDiagnostic = validateExpression(
          argument,
          localNames,
          calleeNames,
        );
        if (argumentDiagnostic) return argumentDiagnostic;
      }
      return undefined;
    }

    case "MemberExpression":
      if (
        expression.computed ||
        expression.property.type !== "Identifier" ||
        !SUPPORTED_PROPERTY_NAMES.has(expression.property.name)
      ) {
        return diagnostic(
          ShaderDiagnosticCode.UnsupportedPropertyAccess,
          "Only direct access to POC uniforms and the x, y, and xy properties is supported.",
          expression,
        );
      }
      if (expression.object.type === "Super") {
        return diagnostic(
          ShaderDiagnosticCode.UnsupportedPropertyAccess,
          "Super property access is not supported in shaders.",
          expression,
        );
      }
      return validateExpression(expression.object, localNames, calleeNames);

    case "OptionalMemberExpression":
    case "OptionalCallExpression":
      return diagnostic(
        ShaderDiagnosticCode.UnsupportedPropertyAccess,
        "Optional access is not supported in shaders.",
        expression,
      );

    case "AssignmentExpression":
      return assignmentDiagnostic(expression);

    case "UnaryExpression":
    case "UpdateExpression":
      return diagnostic(
        ShaderDiagnosticCode.UnsupportedOperator,
        "Unary and update operators are not supported in shaders.",
        expression,
      );

    case "ArrowFunctionExpression":
    case "FunctionExpression":
    case "ClassExpression":
      return diagnostic(
        ShaderDiagnosticCode.NestedFunction,
        "Nested functions and classes are not supported in shader expressions.",
        expression,
      );

    case "TSAsExpression":
    case "TSInstantiationExpression":
    case "TSNonNullExpression":
    case "TSSatisfiesExpression":
    case "TSTypeAssertion":
      return typeAnnotationDiagnostic(expression);

    default:
      return diagnostic(
        ShaderDiagnosticCode.UnsupportedExpression,
        `The ${expression.type} expression is not supported in shaders.`,
        expression,
      );
  }
}

function assignmentDiagnostic(node: Node): ShaderDiagnostic {
  return diagnostic(
    ShaderDiagnosticCode.UnsupportedAssignment,
    "Assignment is not supported in shaders.",
    node,
  );
}

function typeAnnotationDiagnostic(node: Node): ShaderDiagnostic {
  return diagnostic(
    ShaderDiagnosticCode.TypeAnnotation,
    "Type annotations and other TypeScript-only expressions are not supported in the POC shader subset.",
    node,
  );
}

function diagnostic(
  code: ShaderDiagnostic["code"],
  message: string,
  node: Node,
): ShaderDiagnostic {
  return { code, message, range: rangeOf(node), severity: "error" };
}

function rangeOf(node: Node): TextRange {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return { start, length: end - start };
}
