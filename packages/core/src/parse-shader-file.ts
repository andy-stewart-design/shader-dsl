import { parse, type ParseError } from "@babel/parser";
import {
  VISITOR_KEYS,
  type ArrowFunctionExpression,
  type CallExpression,
  type ExportDefaultDeclaration,
  type File,
  type Identifier,
  type ImportDeclaration,
  type ImportSpecifier,
  type Node,
  type ObjectPattern,
} from "@babel/types";

import { ShaderDiagnosticCode, type ShaderDiagnostic } from "./diagnostics.js";
import { normalizeShaderSyntax } from "./normalize-shader-syntax.js";
import type { ShaderCallbackSyntax } from "./shader-syntax.js";
import type { TextRange } from "./source-range.js";
import { validateShaderSyntax } from "./validate-shader-syntax.js";

const SHDR_MODULE_NAME = "shdr";
const CREATE_FRAGMENT_SHADER = "createFragmentShader";
const RESERVED_IDENTIFIER_PREFIX = "__shdr_internal_";
const SUPPORTED_SHADER_CALLABLES = new Set(["vec4"]);

export interface ShaderImportInfo {
  readonly importedName: string;
  readonly localName: string;
  readonly range: TextRange;
}

export interface ShaderCallbackInfo {
  readonly range: TextRange;
  readonly parameterRange: TextRange;
  readonly bodyRange: TextRange;
  readonly syntax: ShaderCallbackSyntax;
}

export interface ShaderFileInfo {
  readonly fileName: string;
  readonly createFragmentShaderImport: ShaderImportInfo;
  readonly shaderCallableImports: readonly ShaderImportInfo[];
  readonly defaultExportRange: TextRange;
  readonly defaultExportCallRange: TextRange;
  readonly callback: ShaderCallbackInfo;
  readonly shaderRegion: TextRange;
}

export interface ParseShaderFileResult {
  readonly info?: ShaderFileInfo;
  /** Available when the callback boundary was recognized but its syntax failed validation. */
  readonly shaderRegion?: TextRange;
  readonly diagnostics: readonly ShaderDiagnostic[];
}

interface ParsedImports {
  readonly createFragmentShaderImport?: ShaderImportInfo;
  readonly shaderCallableImports: readonly ShaderImportInfo[];
  readonly diagnostics: readonly ShaderDiagnostic[];
}

type ParseSourceResult =
  | { readonly file: File; readonly diagnostics: readonly [] }
  | { readonly diagnostics: readonly ShaderDiagnostic[] };

export function parseShaderFile(
  source: string,
  fileName = "shader.shdr.ts",
): ParseShaderFileResult {
  const parsed = parseSource(source, fileName);
  if (!("file" in parsed)) return { diagnostics: parsed.diagnostics };

  const { file } = parsed;
  const reservedIdentifier = findReservedIdentifier(file.program);
  if (reservedIdentifier) {
    return {
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.ReservedIdentifier,
          `Identifiers beginning with ${RESERVED_IDENTIFIER_PREFIX} are reserved for generated shader code.`,
          rangeOf(reservedIdentifier),
        ),
      ],
    };
  }

  const imports = parseImports(file);
  if (imports.diagnostics.length > 0) {
    return { diagnostics: imports.diagnostics };
  }

  if (!imports.createFragmentShaderImport) {
    return {
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.MissingCreateFragmentShaderImport,
          `Expected a direct named import of ${CREATE_FRAGMENT_SHADER} from ${JSON.stringify(SHDR_MODULE_NAME)}.`,
          rangeOf(file.program),
        ),
      ],
    };
  }

  const shaderCalls = findShaderCalls(file.program);
  if (shaderCalls.length > 1) {
    return {
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.MultipleShaderCalls,
          `Expected exactly one ${CREATE_FRAGMENT_SHADER}(...) call.`,
          rangeOf(shaderCalls[1]!),
        ),
      ],
    };
  }

  const defaultExports = file.program.body.filter(
    (statement): statement is ExportDefaultDeclaration =>
      statement.type === "ExportDefaultDeclaration",
  );

  if (defaultExports.length === 0) {
    return {
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.MissingDefaultExport,
          `Expected a default-exported ${CREATE_FRAGMENT_SHADER}(...) call.`,
          shaderCalls[0] ? rangeOf(shaderCalls[0]) : rangeOf(file.program),
        ),
      ],
    };
  }

  if (defaultExports.length > 1) {
    return {
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.InvalidDefaultExport,
          "Expected exactly one default export.",
          rangeOf(defaultExports[1]!),
        ),
      ],
    };
  }

  const defaultExport = defaultExports[0]!;
  if (!isDirectShaderCall(defaultExport.declaration)) {
    return {
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.InvalidDefaultExport,
          `The default export must be a direct ${CREATE_FRAGMENT_SHADER}(...) call.`,
          rangeOf(defaultExport.declaration),
        ),
      ],
    };
  }

  const call = defaultExport.declaration;
  if (shaderCalls.length !== 1 || shaderCalls[0] !== call) {
    return {
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.InvalidDefaultExport,
          `The default export must contain the only ${CREATE_FRAGMENT_SHADER}(...) call.`,
          rangeOf(call),
        ),
      ],
    };
  }

  const callbackArgument = call.arguments[0];
  if (
    call.arguments.length !== 1 ||
    !callbackArgument ||
    callbackArgument.type !== "ArrowFunctionExpression"
  ) {
    return {
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.InvalidShaderCall,
          `${CREATE_FRAGMENT_SHADER}(...) requires exactly one arrow-function callback.`,
          rangeOf(call),
        ),
      ],
    };
  }

  const callback = callbackArgument;
  const callbackRange = rangeOf(callback);
  if (callback.async) {
    return {
      shaderRegion: callbackRange,
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.AsyncCallback,
          "The fragment shader callback cannot be async.",
          rangeOf(callback),
        ),
      ],
    };
  }

  const parameter = callback.params[0];
  if (callback.params.length !== 1 || !isContextParameter(parameter)) {
    return {
      shaderRegion: callbackRange,
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.InvalidCallbackParameter,
          "The callback parameter must be exactly ({ coord, uniforms }).",
          parameter ? rangeOf(parameter) : rangeOf(callback),
        ),
      ],
    };
  }

  if (callback.body.type !== "BlockStatement") {
    return {
      shaderRegion: callbackRange,
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.InvalidCallbackBody,
          "The fragment shader callback must have a block body.",
          rangeOf(callback.body),
        ),
      ],
    };
  }

  const syntaxDiagnostics = validateShaderSyntax(
    callback,
    new Set(
      imports.shaderCallableImports.map((importInfo) => importInfo.localName),
    ),
  );
  if (syntaxDiagnostics.length > 0) {
    return {
      diagnostics: syntaxDiagnostics,
      shaderRegion: callbackRange,
    };
  }

  const syntax = normalizeShaderSyntax(callback);

  return {
    diagnostics: [],
    info: {
      fileName,
      createFragmentShaderImport: imports.createFragmentShaderImport,
      shaderCallableImports: imports.shaderCallableImports,
      defaultExportRange: rangeOf(defaultExport),
      defaultExportCallRange: rangeOf(call),
      callback: {
        range: callbackRange,
        parameterRange: rangeOf(parameter),
        bodyRange: rangeOf(callback.body),
        syntax,
      },
      shaderRegion: callbackRange,
    },
  };
}

function parseSource(source: string, fileName: string): ParseSourceResult {
  try {
    const file = parse(source, {
      createParenthesizedExpressions: true,
      errorRecovery: true,
      plugins: ["typescript"],
      ranges: true,
      sourceFilename: fileName,
      sourceType: "module",
    });

    if (file.errors.length > 0) {
      return {
        diagnostics: file.errors.map((error) =>
          syntaxDiagnostic(error, source),
        ),
      };
    }

    return { file, diagnostics: [] };
  } catch (error) {
    return { diagnostics: [syntaxDiagnostic(error, source)] };
  }
}

function syntaxDiagnostic(error: unknown, source: string): ShaderDiagnostic {
  const parseError = error as Partial<ParseError>;
  const start =
    typeof parseError.pos === "number"
      ? Math.min(Math.max(parseError.pos, 0), source.length)
      : 0;
  const message =
    error instanceof Error
      ? error.message
      : "Unable to parse TypeScript source.";

  return diagnostic(ShaderDiagnosticCode.TypeScriptSyntax, message, {
    start,
    length: start < source.length ? 1 : 0,
  });
}

function findReservedIdentifier(node: Node): Identifier | undefined {
  let match: Identifier | undefined;

  traverse(node, (current) => {
    if (
      !match &&
      current.type === "Identifier" &&
      current.name.startsWith(RESERVED_IDENTIFIER_PREFIX)
    ) {
      match = current;
    }
  });

  return match;
}

function parseImports(file: File): ParsedImports {
  let createFragmentShaderImport: ShaderImportInfo | undefined;
  const shaderCallableImports: ShaderImportInfo[] = [];
  const diagnostics: ShaderDiagnostic[] = [];

  for (const statement of file.program.body) {
    if (statement.type !== "ImportDeclaration") continue;

    if (statement.source.value !== SHDR_MODULE_NAME) {
      if (
        statement.specifiers.some(
          (specifier) =>
            specifier.type === "ImportSpecifier" &&
            importedNameOf(specifier) === CREATE_FRAGMENT_SHADER,
        )
      ) {
        diagnostics.push(
          diagnostic(
            ShaderDiagnosticCode.WrongModule,
            `${CREATE_FRAGMENT_SHADER} must be imported from ${JSON.stringify(SHDR_MODULE_NAME)}.`,
            rangeOf(statement.source),
          ),
        );
      }
      continue;
    }

    parseShdrImport(
      statement,
      diagnostics,
      shaderCallableImports,
      (importInfo) => {
        if (createFragmentShaderImport) {
          diagnostics.push(
            diagnostic(
              ShaderDiagnosticCode.DuplicateCreateFragmentShaderImport,
              `${CREATE_FRAGMENT_SHADER} may only be imported once.`,
              importInfo.range,
            ),
          );
        } else {
          createFragmentShaderImport = importInfo;
        }
      },
    );
  }

  return {
    createFragmentShaderImport,
    shaderCallableImports,
    diagnostics,
  };
}

function parseShdrImport(
  declaration: ImportDeclaration,
  diagnostics: ShaderDiagnostic[],
  shaderCallableImports: ShaderImportInfo[],
  setCreateFragmentShaderImport: (importInfo: ShaderImportInfo) => void,
): void {
  if (declaration.importKind === "type") {
    diagnostics.push(
      diagnostic(
        ShaderDiagnosticCode.UnsupportedShdrImport,
        "The POC requires value imports from shdr.",
        rangeOf(declaration),
      ),
    );
    return;
  }

  for (const specifier of declaration.specifiers) {
    if (specifier.type === "ImportNamespaceSpecifier") {
      diagnostics.push(
        diagnostic(
          ShaderDiagnosticCode.NamespaceImport,
          "Namespace imports from shdr are not supported.",
          rangeOf(specifier),
        ),
      );
      continue;
    }

    if (specifier.type === "ImportDefaultSpecifier") {
      diagnostics.push(
        diagnostic(
          ShaderDiagnosticCode.UnsupportedShdrImport,
          "Only direct named imports are supported from shdr.",
          rangeOf(specifier),
        ),
      );
      continue;
    }

    const importedName = importedNameOf(specifier);
    if (
      specifier.importKind === "type" ||
      specifier.local.name !== importedName
    ) {
      diagnostics.push(
        diagnostic(
          ShaderDiagnosticCode.ImportAlias,
          "Import aliases and type-only specifiers from shdr are not supported.",
          rangeOf(specifier),
        ),
      );
      continue;
    }

    const importInfo: ShaderImportInfo = {
      importedName,
      localName: specifier.local.name,
      range: rangeOf(specifier),
    };

    if (importedName === CREATE_FRAGMENT_SHADER) {
      setCreateFragmentShaderImport(importInfo);
    } else if (SUPPORTED_SHADER_CALLABLES.has(importedName)) {
      shaderCallableImports.push(importInfo);
    } else {
      diagnostics.push(
        diagnostic(
          ShaderDiagnosticCode.UnsupportedShdrImport,
          `${importedName} is not a supported POC shader import.`,
          rangeOf(specifier),
        ),
      );
    }
  }
}

function importedNameOf(specifier: ImportSpecifier): string {
  return specifier.imported.type === "Identifier"
    ? specifier.imported.name
    : specifier.imported.value;
}

function findShaderCalls(node: Node): readonly CallExpression[] {
  const calls: CallExpression[] = [];

  traverse(node, (current) => {
    if (isDirectShaderCall(current)) calls.push(current);
  });

  return calls;
}

function isDirectShaderCall(node: Node): node is CallExpression {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === CREATE_FRAGMENT_SHADER
  );
}

function isContextParameter(
  parameter: ArrowFunctionExpression["params"][number] | undefined,
): parameter is ObjectPattern {
  if (!parameter || parameter.type !== "ObjectPattern") return false;
  if (parameter.properties.length !== 2) return false;

  return parameter.properties.every((property, index) => {
    const expectedName = index === 0 ? "coord" : "uniforms";

    return (
      property.type === "ObjectProperty" &&
      property.computed === false &&
      property.shorthand === true &&
      property.key.type === "Identifier" &&
      property.key.name === expectedName &&
      property.value.type === "Identifier" &&
      property.value.name === expectedName
    );
  });
}

function traverse(node: Node, visit: (node: Node) => void): void {
  visit(node);

  const keys = VISITOR_KEYS[node.type] ?? [];
  const record = node as Node & Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) traverse(item, visit);
      }
    } else if (isNode(value)) {
      traverse(value, visit);
    }
  }
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function rangeOf(node: Node): TextRange {
  const start = node.start ?? 0;
  const end = node.end ?? start;
  return { start, length: end - start };
}

function diagnostic(
  code: ShaderDiagnostic["code"],
  message: string,
  range: TextRange,
): ShaderDiagnostic {
  return { code, message, range, severity: "error" };
}
