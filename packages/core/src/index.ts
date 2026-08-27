export {
  ShaderDiagnosticCode,
  type ShaderDiagnostic,
  type ShaderDiagnosticCode as ShaderDiagnosticCodeValue,
} from "./diagnostics.js";
export {
  parseShaderFile,
  type ParseShaderFileResult,
  type ShaderCallbackInfo,
  type ShaderFileInfo,
  type ShaderImportInfo,
} from "./parse-shader-file.js";
export type { TextRange } from "./source-range.js";

export type CorePackage = "@shdr/core";

export const corePackageName: CorePackage = "@shdr/core";
