import type { TextRange } from "./source-range.js";

interface ShaderSyntaxNode {
  readonly range: TextRange;
}

export interface ShaderCallbackSyntax extends ShaderSyntaxNode {
  readonly declarations: readonly ShaderConstDeclarationSyntax[];
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
  | ShaderDivisionExpressionSyntax
  | ShaderConstructorCallSyntax
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

export interface ShaderDivisionExpressionSyntax extends ShaderSyntaxNode {
  readonly kind: "division-expression";
  readonly left: ShaderExpressionSyntax;
  readonly right: ShaderExpressionSyntax;
}

export interface ShaderConstructorCallSyntax extends ShaderSyntaxNode {
  readonly kind: "constructor-call";
  readonly constructorName: string;
  readonly calleeRange: TextRange;
  readonly arguments: readonly ShaderExpressionSyntax[];
}

export interface ShaderPropertyAccessSyntax extends ShaderSyntaxNode {
  readonly kind: "property-access";
  readonly object: ShaderExpressionSyntax;
  readonly propertyName: string;
  readonly propertyRange: TextRange;
}
