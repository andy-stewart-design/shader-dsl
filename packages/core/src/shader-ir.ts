import type {
  ShaderBinaryOperator,
  ShaderUnaryOperator,
} from "./shader-operator.js";
import type { ShaderValueType } from "./shader-type.js";
import type { TextRange } from "./source-range.js";

export type ShaderBuiltinInput = "fragment-position";

export type ShaderDefaultUniform = "resolution" | "mouse" | "time";

/** Stable only within one shader module. */
export type ShaderLocalSymbolId = number;

export type ShaderConstructorName = "vec2" | "vec3" | "vec4";

/** No built-in functions are accepted by the POC yet. */
export type ShaderBuiltinFunctionName = never;

export type ShaderCallTarget =
  | {
      readonly kind: "constructor";
      readonly name: ShaderConstructorName;
    }
  | {
      readonly kind: "builtin-function";
      readonly name: ShaderBuiltinFunctionName;
    };

export type ShaderVectorComponent = 0 | 1 | 2 | 3;

export type ShaderSwizzleComponents =
  | readonly [ShaderVectorComponent]
  | readonly [ShaderVectorComponent, ShaderVectorComponent]
  | readonly [
      ShaderVectorComponent,
      ShaderVectorComponent,
      ShaderVectorComponent,
    ]
  | readonly [
      ShaderVectorComponent,
      ShaderVectorComponent,
      ShaderVectorComponent,
      ShaderVectorComponent,
    ];

export interface ShaderExpressionBase {
  readonly type: ShaderValueType;
  readonly range: TextRange;
}

export interface ShaderNumericLiteralExpression extends ShaderExpressionBase {
  readonly kind: "numeric-literal";
  readonly value: number;
}

export interface ShaderBuiltinInputExpression extends ShaderExpressionBase {
  readonly kind: "builtin-input";
  readonly input: ShaderBuiltinInput;
}

export interface ShaderDefaultUniformExpression extends ShaderExpressionBase {
  readonly kind: "default-uniform";
  readonly uniform: ShaderDefaultUniform;
}

export interface ShaderLocalReferenceExpression extends ShaderExpressionBase {
  readonly kind: "local-reference";
  readonly name: string;
  readonly symbolId: ShaderLocalSymbolId;
}

export interface ShaderSwizzleExpression extends ShaderExpressionBase {
  readonly kind: "swizzle";
  readonly expression: ShaderExpression;
  readonly components: ShaderSwizzleComponents;
}

export interface ShaderBinaryExpression extends ShaderExpressionBase {
  readonly kind: "binary";
  readonly operator: ShaderBinaryOperator;
  readonly left: ShaderExpression;
  readonly right: ShaderExpression;
}

export interface ShaderUnaryExpression extends ShaderExpressionBase {
  readonly kind: "unary";
  readonly operator: ShaderUnaryOperator;
  readonly argument: ShaderExpression;
}

export interface ShaderCallExpression extends ShaderExpressionBase {
  readonly kind: "call";
  readonly target: ShaderCallTarget;
  readonly arguments: readonly ShaderExpression[];
}

export type ShaderExpression =
  | ShaderNumericLiteralExpression
  | ShaderBuiltinInputExpression
  | ShaderDefaultUniformExpression
  | ShaderLocalReferenceExpression
  | ShaderSwizzleExpression
  | ShaderBinaryExpression
  | ShaderUnaryExpression
  | ShaderCallExpression;

export interface ShaderConstDeclaration {
  readonly kind: "const-declaration";
  readonly name: string;
  readonly symbolId: ShaderLocalSymbolId;
  readonly nameRange: TextRange;
  readonly initializer: ShaderExpression;
  readonly range: TextRange;
}

export interface ShaderReturnStatement {
  readonly kind: "return-statement";
  readonly expression: ShaderExpression;
  readonly range: TextRange;
}

export type ShaderStatement = ShaderConstDeclaration | ShaderReturnStatement;

export type ShaderStage = "fragment";

export interface ShaderModule {
  readonly kind: "shader-module";
  readonly stage: ShaderStage;
  readonly statements: readonly ShaderStatement[];
  readonly range: TextRange;
}
