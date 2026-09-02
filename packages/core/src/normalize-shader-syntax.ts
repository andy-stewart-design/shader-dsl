import type { ArrowFunctionExpression, Expression, Node } from "@babel/types";

import type {
  ShaderCallbackSyntax,
  ShaderConstDeclarationSyntax,
  ShaderExpressionSyntax,
} from "./shader-syntax.js";
import type { TextRange } from "./source-range.js";

export function normalizeShaderSyntax(
  callback: ArrowFunctionExpression,
): ShaderCallbackSyntax {
  if (callback.body.type !== "BlockStatement") {
    throw new Error("Cannot normalize an expression-bodied shader callback.");
  }

  const declarations: ShaderConstDeclarationSyntax[] = [];
  for (const statement of callback.body.body.slice(0, -1)) {
    if (
      statement.type !== "VariableDeclaration" ||
      statement.declarations.length !== 1
    ) {
      throw new Error("Cannot normalize an unsupported shader statement.");
    }

    const declarator = statement.declarations[0]!;
    if (declarator.id.type !== "Identifier" || !declarator.init) {
      throw new Error("Cannot normalize an unsupported shader declaration.");
    }

    declarations.push({
      range: rangeOf(statement),
      name: declarator.id.name,
      nameRange: rangeOf(declarator.id),
      initializer: normalizeExpression(declarator.init),
    });
  }

  const returnStatement = callback.body.body.at(-1);
  if (
    returnStatement?.type !== "ReturnStatement" ||
    !returnStatement.argument
  ) {
    throw new Error(
      "Cannot normalize a shader callback without a final return.",
    );
  }

  return {
    range: rangeOf(callback),
    declarations,
    returnRange: rangeOf(returnStatement),
    returnExpression: normalizeExpression(returnStatement.argument),
  };
}

function normalizeExpression(expression: Expression): ShaderExpressionSyntax {
  switch (expression.type) {
    case "NumericLiteral":
      return {
        kind: "numeric-literal",
        range: rangeOf(expression),
        value: expression.value,
      };

    case "Identifier":
      return {
        kind: "identifier",
        range: rangeOf(expression),
        name: expression.name,
      };

    case "ParenthesizedExpression":
      return {
        kind: "parenthesized-expression",
        range: rangeOf(expression),
        expression: normalizeExpression(expression.expression),
      };

    case "BinaryExpression":
      if (expression.operator !== "/") break;
      return {
        kind: "binary-expression",
        range: rangeOf(expression),
        operator: expression.operator,
        left: normalizeExpression(expression.left),
        right: normalizeExpression(expression.right),
      };

    case "CallExpression":
      if (expression.callee.type !== "Identifier") break;
      return {
        kind: "call-expression",
        range: rangeOf(expression),
        calleeName: expression.callee.name,
        calleeRange: rangeOf(expression.callee),
        arguments: expression.arguments.map((argument) => {
          if (
            argument.type === "SpreadElement" ||
            argument.type === "ArgumentPlaceholder"
          ) {
            throw new Error(
              "Cannot normalize an unsupported shader callable argument.",
            );
          }
          return normalizeExpression(argument);
        }),
      };

    case "MemberExpression":
      if (
        expression.object.type === "Super" ||
        expression.property.type !== "Identifier"
      ) {
        break;
      }
      return {
        kind: "property-access",
        range: rangeOf(expression),
        object: normalizeExpression(expression.object),
        propertyName: expression.property.name,
        propertyRange: rangeOf(expression.property),
      };
  }

  throw new Error(
    `Cannot normalize unsupported ${expression.type} expression.`,
  );
}

function rangeOf(node: Node): TextRange {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return { start, length: end - start };
}
