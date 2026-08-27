import type { TextRange } from "./source-range.js";

export const ShaderDiagnosticCode = {
  TypeScriptSyntax: "SHDR1000",
  ReservedIdentifier: "SHDR1001",
  WrongModule: "SHDR1002",
  ImportAlias: "SHDR1003",
  NamespaceImport: "SHDR1004",
  MissingCreateFragmentShaderImport: "SHDR1005",
  DuplicateCreateFragmentShaderImport: "SHDR1006",
  UnsupportedShdrImport: "SHDR1007",
  MissingDefaultExport: "SHDR1008",
  InvalidDefaultExport: "SHDR1009",
  MultipleShaderCalls: "SHDR1010",
  InvalidShaderCall: "SHDR1011",
  AsyncCallback: "SHDR1012",
  InvalidCallbackParameter: "SHDR1013",
  InvalidCallbackBody: "SHDR1014",
} as const;

export type ShaderDiagnosticCode =
  (typeof ShaderDiagnosticCode)[keyof typeof ShaderDiagnosticCode];

export interface ShaderDiagnostic {
  readonly code: ShaderDiagnosticCode;
  readonly message: string;
  readonly range: TextRange;
  readonly severity: "error";
}
