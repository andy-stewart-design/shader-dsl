import type {
  ShaderBinaryOperator,
  ShaderUnaryOperator,
} from "./shader-operator.js";
import type { TextRange } from "./source-range.js";

interface ShaderSyntaxNode {
  readonly range: TextRange;
}

export interface ShaderCallbackSyntax extends ShaderSyntaxNode {
  readonly declarations: readonly ShaderConstDeclarationSyntax[];
  readonly returnRange: TextRange;
  readonly returnExpression: ShaderExpressionSyntax;
}

export interface ShaderConstDeclarationSyntax extends ShaderSyntaxNode {
  readonly name: string;
  readonly nameRange: TextRange;
  readonly initializer: ShaderExpressionSyntax;
}

export type ShaderExpressionSyntax =
  | ShaderNumericLiteralSyntax
  | ShaderIdentifierSyntax
  | ShaderParenthesizedExpressionSyntax
  | ShaderBinaryExpressionSyntax
  | ShaderUnaryExpressionSyntax
  | ShaderCallExpressionSyntax
  | ShaderPropertyAccessSyntax;

export interface ShaderNumericLiteralSyntax extends ShaderSyntaxNode {
  readonly kind: "numeric-literal";
  readonly value: number;
}

export interface ShaderIdentifierSyntax extends ShaderSyntaxNode {
  readonly kind: "identifier";
  readonly name: string;
}

export interface ShaderParenthesizedExpressionSyntax extends ShaderSyntaxNode {
  readonly kind: "parenthesized-expression";
  readonly expression: ShaderExpressionSyntax;
}

export interface ShaderBinaryExpressionSyntax extends ShaderSyntaxNode {
  readonly kind: "binary-expression";
  readonly operator: ShaderBinaryOperator;
  readonly left: ShaderExpressionSyntax;
  readonly right: ShaderExpressionSyntax;
}

export interface ShaderUnaryExpressionSyntax extends ShaderSyntaxNode {
  readonly kind: "unary-expression";
  readonly operator: ShaderUnaryOperator;
  readonly argument: ShaderExpressionSyntax;
}

export interface ShaderCallExpressionSyntax extends ShaderSyntaxNode {
  readonly kind: "call-expression";
  readonly calleeName: string;
  readonly calleeRange: TextRange;
  readonly arguments: readonly ShaderExpressionSyntax[];
}

export interface ShaderPropertyAccessSyntax extends ShaderSyntaxNode {
  readonly kind: "property-access";
  readonly object: ShaderExpressionSyntax;
  readonly propertyName: string;
  readonly propertyRange: TextRange;
}
