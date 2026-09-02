export {
  createVirtualSource,
  type CreateVirtualSourceFailure,
  type CreateVirtualSourceResult,
  type CreateVirtualSourceSuccess,
} from "./create-virtual-source.js";
export {
  ShaderDiagnosticCode,
  type ShaderDiagnostic,
  type ShaderDiagnosticCode as ShaderDiagnosticCodeValue,
} from "./diagnostics.js";
export {
  lowerShaderSyntax,
  type LowerShaderSyntaxFailure,
  type LowerShaderSyntaxResult,
  type LowerShaderSyntaxSuccess,
} from "./lower-shader-syntax.js";
export {
  MappedTextWriter,
  mapGeneratedRangeToOriginal,
  mapOriginalOffsetToGenerated,
  type SourceMapping,
  type SourceMappingKind,
  type VirtualBinaryOperation,
  type VirtualOperation,
  type VirtualSource,
} from "./mapped-text-writer.js";
export type {
  ShaderBinaryExpression,
  ShaderBuiltinFunctionName,
  ShaderBuiltinInput,
  ShaderBuiltinInputExpression,
  ShaderCallExpression,
  ShaderCallTarget,
  ShaderConstDeclaration,
  ShaderConstructorName,
  ShaderDefaultUniform,
  ShaderDefaultUniformExpression,
  ShaderExpression,
  ShaderExpressionBase,
  ShaderLocalReferenceExpression,
  ShaderLocalSymbolId,
  ShaderModule,
  ShaderNumericLiteralExpression,
  ShaderReturnStatement,
  ShaderStage,
  ShaderStatement,
  ShaderSwizzleComponents,
  ShaderSwizzleExpression,
  ShaderVectorComponent,
} from "./shader-ir.js";
export type { ShaderBinaryOperator } from "./shader-operator.js";
export type {
  ShaderScalarKind,
  ShaderScalarType,
  ShaderValueType,
  ShaderVectorSize,
  ShaderVectorType,
} from "./shader-type.js";
export {
  parseShaderFile,
  type ParseShaderFileResult,
  type ShaderCallbackInfo,
  type ShaderFileInfo,
  type ShaderImportInfo,
} from "./parse-shader-file.js";
export type {
  ShaderBinaryExpressionSyntax,
  ShaderCallbackSyntax,
  ShaderCallExpressionSyntax,
  ShaderConstDeclarationSyntax,
  ShaderExpressionSyntax,
  ShaderIdentifierSyntax,
  ShaderNumericLiteralSyntax,
  ShaderParenthesizedExpressionSyntax,
  ShaderPropertyAccessSyntax,
} from "./shader-syntax.js";
export type { TextRange } from "./source-range.js";

export type CorePackage = "@shdr/core";

export const corePackageName: CorePackage = "@shdr/core";
