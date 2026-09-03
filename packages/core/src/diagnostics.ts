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
  InvalidVariableDeclaration: "SHDR1100",
  InvalidReturn: "SHDR1101",
  UnsupportedStatement: "SHDR1102",
  UnsupportedExpression: "SHDR1103",
  UnsupportedAssignment: "SHDR1104",
  UnsupportedOperator: "SHDR1105",
  UnsupportedCall: "SHDR1106",
  UnsupportedPropertyAccess: "SHDR1107",
  ClosureCapture: "SHDR1108",
  TypeAnnotation: "SHDR1109",
  NestedFunction: "SHDR1110",
  UnknownIdentifier: "SHDR1200",
  ForwardReference: "SHDR1201",
  DuplicateLocal: "SHDR1202",
  InvalidUniform: "SHDR1203",
  InvalidSwizzle: "SHDR1204",
  InvalidBinaryOperation: "SHDR1205",
} as const;

export type ShaderDiagnosticCode =
  (typeof ShaderDiagnosticCode)[keyof typeof ShaderDiagnosticCode];

export interface ShaderDiagnostic {
  readonly code: ShaderDiagnosticCode;
  readonly message: string;
  readonly range: TextRange;
  readonly severity: "error";
}
