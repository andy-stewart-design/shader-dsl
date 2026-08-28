import type { CorePackage } from "@shdr/core";

export {
  routeShaderDiagnostics,
  type RoutedDiagnostic,
  type RoutedDiagnosticSource,
  type RouteShaderDiagnosticsInput,
} from "./diagnostic-routing.js";
export {
  TypeScript7EditorAdapter,
  type EditorDocumentVersion,
  type TypeScript7EditorDocument,
  type TypeScript7EditorDocumentInput,
} from "./typescript-7-editor-adapter.js";
export {
  TypeScript7CheckerAdapter,
  type CheckedTypeScriptSource,
  type CheckedVirtualSource,
  type NamedDeclarationType,
  type ShaderOperationDiagnostic,
  type TypeScript7CheckerOptions,
  type TypeScriptCheckerDiagnostic,
  type TypeScriptDiagnosticCategory,
  type TypeScriptQuickInfo,
} from "./typescript-7-checker.js";

export type LanguageServicePackage = "@shdr/language-service";
export type LanguageServiceWorkspaceSmoke = CorePackage;

export const languageServicePackageName: LanguageServicePackage =
  "@shdr/language-service";
