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
  MappedTextWriter,
  mapGeneratedRangeToOriginal,
  mapOriginalOffsetToGenerated,
  type SourceMapping,
  type SourceMappingKind,
  type VirtualSource,
} from "./mapped-text-writer.js";
export {
  parseShaderFile,
  type ParseShaderFileResult,
  type ShaderCallbackInfo,
  type ShaderFileInfo,
  type ShaderImportInfo,
} from "./parse-shader-file.js";
export type {
  ShaderCallbackSyntax,
  ShaderConstDeclarationSyntax,
  ShaderConstructorCallSyntax,
  ShaderDivisionExpressionSyntax,
  ShaderExpressionSyntax,
  ShaderIdentifierSyntax,
  ShaderNumericLiteralSyntax,
  ShaderParenthesizedExpressionSyntax,
  ShaderPropertyAccessSyntax,
} from "./shader-syntax.js";
export type { TextRange } from "./source-range.js";

export type CorePackage = "@shdr/core";

export const corePackageName: CorePackage = "@shdr/core";
