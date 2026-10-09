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

import { isShaderBuiltinName } from "./shader-builtin.js";
import {
  parseCustomUniforms,
  type ParsedCustomUniforms,
} from "./parse-custom-uniforms.js";
import { ShaderDiagnosticCode, type ShaderDiagnostic } from "./diagnostics.js";
import { normalizeShaderSyntax } from "./normalize-shader-syntax.js";
import type {
  ShaderCallbackSyntax,
  ShaderFunctionSyntax,
} from "./shader-syntax.js";
import {
  parseShaderFunctions,
  SHADER_TYPE_IMPORTS,
} from "./parse-shader-functions.js";
import type { TextRange } from "./source-range.js";
import { validateShaderSyntax } from "./validate-shader-syntax.js";

const SHDR_MODULE_NAME = "shdr";
const CREATE_FRAGMENT_SHADER = "createFragmentShader";
const RESERVED_IDENTIFIER_PREFIX = "__shdr_internal_";
const WGSL_HELPER_IDENTIFIER_PREFIX = "shdr_internal_";
const SUPPORTED_SHADER_CALLABLES = new Set(["vec2", "vec3", "vec4"]);

export interface ShaderImportInfo {
  readonly importedName: string;
  readonly localName: string;
  readonly range: TextRange;
}

export interface ShaderSourceImportInfo {
  readonly source: string;
  readonly sourceRange: TextRange;
  readonly specifiers: readonly ShaderImportInfo[];
  readonly unsupportedSpecifierRanges: readonly TextRange[];
}

export interface ShaderCallbackInfo {
  readonly range: TextRange;
  readonly parameterRange: TextRange;
  readonly bodyRange: TextRange;
  readonly syntax: ShaderCallbackSyntax;
}

export interface ShaderFileInfo {
  readonly fileName: string;
  readonly createFragmentShaderImport?: ShaderImportInfo;
  readonly customUniforms?: ParsedCustomUniforms;
  /** Selected when the explicit { uniforms } link refers to another module. */
  readonly customUniformsImport?: ShaderImportInfo;
  readonly functions?: readonly ShaderFunctionSyntax[];
  readonly shaderCallableImports: readonly ShaderImportInfo[];
  /** Direct named imports from other source modules. */
  readonly sourceImports: readonly ShaderSourceImportInfo[];
  readonly defaultExportRange: TextRange;
  readonly defaultExportCallRange: TextRange;
  readonly callback: ShaderCallbackInfo;
  readonly shaderRegion: TextRange;
}

export interface ParseShaderFileResult {
  readonly info?: ShaderFileInfo;
  /** Available when the callback boundary was recognized but its syntax failed validation. */
  readonly shaderRegion?: TextRange;
  /** Helper declarations and fragment callback recognized before semantic validation. */
  readonly shaderRegions?: readonly TextRange[];
  readonly diagnostics: readonly ShaderDiagnostic[];
}

interface ParsedImports {
  readonly createFragmentShaderImport?: ShaderImportInfo;
  readonly defineUniformsImport?: ShaderImportInfo;
  readonly shaderCallableImports: readonly ShaderImportInfo[];
  readonly sourceImports: readonly ShaderSourceImportInfo[];
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
  const result = parseShaderModule(file, fileName);
  const helperRegions = findHelperRegions(file);
  if (!helperRegions.length) return result;

  // Retain boundaries even when a helper signature/body fails before the
  // fragment is validated. They must not swallow ordinary code between helpers.
  const defaultExport = file.program.body.find(
    (statement) => statement.type === "ExportDefaultDeclaration",
  );
  const callback =
    defaultExport?.type === "ExportDefaultDeclaration" &&
    isShaderCall(defaultExport.declaration)
      ? defaultExport.declaration.arguments[0]
      : undefined;
  const shaderRegion =
    result.info?.shaderRegion ??
    result.shaderRegion ??
    (callback?.type === "ArrowFunctionExpression"
      ? rangeOf(callback)
      : undefined);
  const shaderRegions = [
    ...helperRegions,
    ...(shaderRegion ? [shaderRegion] : []),
  ].sort((left, right) => left.start - right.start);
  return {
    ...result,
    ...(shaderRegion && !result.info ? { shaderRegion } : {}),
    shaderRegions,
  };
}

function findHelperRegions(file: File): readonly TextRange[] {
  const imported = file.program.body.some(
    (statement) =>
      statement.type === "ImportDeclaration" &&
      statement.source.value === SHDR_MODULE_NAME &&
      statement.importKind !== "type" &&
      statement.specifiers.some(
        (specifier) =>
          specifier.type === "ImportSpecifier" &&
          specifier.importKind !== "type" &&
          importedNameOf(specifier) === "defineShaderFunction" &&
          specifier.local.name === "defineShaderFunction",
      ),
  );
  if (!imported) return [];
  return file.program.body.flatMap((statement) => {
    const declaration =
      statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    if (declaration?.type !== "VariableDeclaration") return [];
    return declaration.declarations
      .filter(
        (item) =>
          item.init?.type === "CallExpression" &&
          item.init.callee.type === "Identifier" &&
          item.init.callee.name === "defineShaderFunction",
      )
      .map(rangeOf);
  });
}

function parseShaderModule(
  file: File,
  fileName: string,
): ParseShaderFileResult {
  const reservedIdentifier = findReservedIdentifier(file.program);
  if (reservedIdentifier) {
    return {
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.ReservedIdentifier,
          `Identifiers beginning with ${reservedIdentifier.name.startsWith(WGSL_HELPER_IDENTIFIER_PREFIX) ? WGSL_HELPER_IDENTIFIER_PREFIX : RESERVED_IDENTIFIER_PREFIX} are reserved for generated shader code.`,
          rangeOf(reservedIdentifier),
        ),
      ],
    };
  }

  const imports = parseImports(file);
  if (imports.diagnostics.length > 0) {
    return { diagnostics: imports.diagnostics };
  }

  const shdrImports = file.program.body.filter(
    (item): item is ImportDeclaration =>
      item.type === "ImportDeclaration" &&
      item.source.value === SHDR_MODULE_NAME,
  );
  const typeImports = new Set(
    shdrImports.flatMap((item) =>
      item.specifiers.flatMap((specifier) =>
        specifier.type === "ImportSpecifier" &&
        (item.importKind === "type" || specifier.importKind === "type")
          ? [importedNameOf(specifier)]
          : [],
      ),
    ),
  );
  const markerImported = shdrImports.some(
    (item) =>
      item.importKind !== "type" &&
      item.specifiers.some(
        (specifier) =>
          specifier.type === "ImportSpecifier" &&
          specifier.importKind !== "type" &&
          importedNameOf(specifier) === "defineShaderFunction",
      ),
  );
  const helpers = parseShaderFunctions(
    file,
    markerImported,
    typeImports,
    new Set([
      ...imports.shaderCallableImports.map((entry) => entry.localName),
      ...imports.sourceImports.flatMap((entry) =>
        entry.specifiers.map((specifier) => specifier.localName),
      ),
    ]),
  );
  if (helpers.diagnostics.length) return { diagnostics: helpers.diagnostics };

  if (!imports.createFragmentShaderImport && !imports.defineUniformsImport) {
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
  if (!isShaderCall(defaultExport.declaration)) {
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
  const chained = isChainedShaderCall(call);
  if (
    (chained && !imports.defineUniformsImport) ||
    (!chained && !imports.createFragmentShaderImport)
  ) {
    return {
      diagnostics: [
        diagnostic(
          ShaderDiagnosticCode.MissingCreateFragmentShaderImport,
          `Import ${chained ? "defineUniforms" : CREATE_FRAGMENT_SHADER} directly from "shdr".`,
          rangeOf(call),
        ),
      ],
    };
  }
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
    call.typeArguments ||
    (chained
      ? call.arguments.length !== 1
      : call.arguments.length < 1 || call.arguments.length > 2) ||
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

  let customUniforms: ParsedCustomUniforms | undefined;
  let customUniformsImport: ShaderImportInfo | undefined;
  if (chained || call.arguments.length === 2) {
    if (chained && !imports.defineUniformsImport) {
      return {
        diagnostics: [
          diagnostic(
            ShaderDiagnosticCode.InvalidCustomUniform,
            "Custom uniforms require a direct named defineUniforms import from shdr.",
            rangeOf(call),
          ),
        ],
      };
    }
    let definition: CallExpression | undefined;
    if (chained) {
      definition = call.callee.object as CallExpression;
    } else {
      const options = call.arguments[1];
      if (
        options?.type !== "ObjectExpression" ||
        options.properties.length !== 1 ||
        options.properties[0]?.type !== "ObjectProperty" ||
        !options.properties[0].shorthand ||
        options.properties[0].computed ||
        options.properties[0].key.type !== "Identifier" ||
        options.properties[0].key.name !== "uniforms" ||
        options.properties[0].value.type !== "Identifier"
      ) {
        return {
          diagnostics: [
            diagnostic(
              ShaderDiagnosticCode.InvalidCustomUniform,
              "Expected exactly { uniforms } as the second argument.",
              rangeOf(options ?? call),
            ),
          ],
        };
      }
      const identifier = options.properties[0].value.name;
      const declarations = file.program.body.flatMap((statement) => {
        const declaration =
          statement.type === "ExportNamedDeclaration"
            ? statement.declaration
            : statement;
        return declaration?.type === "VariableDeclaration" &&
          declaration.kind === "const" &&
          declaration.declarations.length === 1 &&
          declaration.declarations[0]?.id.type === "Identifier" &&
          declaration.declarations[0].id.name === identifier
          ? [declaration]
          : [];
      });
      const init = declarations[0]?.declarations[0]?.init;
      if (
        declarations.length === 1 &&
        init?.type === "CallExpression" &&
        init.callee.type === "Identifier" &&
        init.callee.name === "defineUniforms" &&
        (init.end ?? 0) <= (call.start ?? 0)
      ) {
        if (!imports.defineUniformsImport) {
          return {
            diagnostics: [
              diagnostic(
                ShaderDiagnosticCode.InvalidCustomUniform,
                "Same-file custom uniforms require a direct named defineUniforms import from shdr.",
                rangeOf(options),
              ),
            ],
          };
        }
        definition = init;
      } else {
        customUniformsImport = imports.sourceImports
          .flatMap((entry) => entry.specifiers)
          .find((specifier) => specifier.localName === identifier);
        if (!customUniformsImport) {
          return {
            diagnostics: [
              diagnostic(
                ShaderDiagnosticCode.InvalidCustomUniform,
                "Expected a same-file defineUniforms declaration or an imported uniforms schema.",
                rangeOf(options),
              ),
            ],
          };
        }
      }
    }
    if (definition) {
      const parsedCustom = parseCustomUniforms(definition);
      if (!parsedCustom.ok) return { diagnostics: parsedCustom.diagnostics };
      customUniforms = parsedCustom.value;
    }
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
          "The callback parameter must be ({ coord, uniforms }) or ({ uniforms }).",
          parameter ? rangeOf(parameter) : rangeOf(callback),
        ),
      ],
    };
  }

  const syntaxDiagnostics = validateShaderSyntax(
    callback,
    new Set([
      ...imports.shaderCallableImports.map(
        (importInfo) => importInfo.localName,
      ),
      ...imports.sourceImports.flatMap((entry) =>
        entry.specifiers.map((specifier) => specifier.localName),
      ),
      ...helpers.functions.map((helper) => helper.name),
    ]),
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
      customUniforms,
      ...(customUniformsImport ? { customUniformsImport } : {}),
      ...(helpers.functions.length ? { functions: helpers.functions } : {}),
      shaderCallableImports: imports.shaderCallableImports,
      sourceImports: imports.sourceImports,
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
      (current.name.startsWith(RESERVED_IDENTIFIER_PREFIX) ||
        current.name.startsWith(WGSL_HELPER_IDENTIFIER_PREFIX))
    ) {
      match = current;
    }
  });

  return match;
}

function parseImports(file: File): ParsedImports {
  let createFragmentShaderImport: ShaderImportInfo | undefined;
  let defineUniformsImport: ShaderImportInfo | undefined;
  const shaderCallableImports: ShaderImportInfo[] = [];
  const sourceImports: ShaderSourceImportInfo[] = [];
  const diagnostics: ShaderDiagnostic[] = [];

  for (const statement of file.program.body) {
    if (statement.type !== "ImportDeclaration") continue;

    if (statement.source.value !== SHDR_MODULE_NAME) {
      if (
        statement.importKind !== "type" &&
        statement.specifiers.some(
          (specifier) =>
            specifier.type !== "ImportSpecifier" ||
            specifier.importKind !== "type",
        )
      ) {
        sourceImports.push({
          source: statement.source.value,
          sourceRange: rangeOf(statement.source),
          specifiers: statement.specifiers.flatMap((specifier) =>
            specifier.type === "ImportSpecifier" &&
            specifier.importKind !== "type"
              ? [
                  {
                    importedName: importedNameOf(specifier),
                    localName: specifier.local.name,
                    range: rangeOf(specifier),
                  },
                ]
              : [],
          ),
          unsupportedSpecifierRanges: statement.specifiers.flatMap(
            (specifier) =>
              specifier.type === "ImportSpecifier" ? [] : [rangeOf(specifier)],
          ),
        });
      }
      const wrongImport = statement.specifiers.find(
        (specifier) =>
          specifier.type === "ImportSpecifier" &&
          (importedNameOf(specifier) === CREATE_FRAGMENT_SHADER ||
            importedNameOf(specifier) === "defineUniforms"),
      );
      if (wrongImport?.type === "ImportSpecifier") {
        diagnostics.push(
          diagnostic(
            ShaderDiagnosticCode.WrongModule,
            `${importedNameOf(wrongImport)} must be imported from ${JSON.stringify(SHDR_MODULE_NAME)}.`,
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
      (importInfo) => {
        if (defineUniformsImport)
          diagnostics.push(
            diagnostic(
              ShaderDiagnosticCode.InvalidCustomUniform,
              "defineUniforms may only be imported once.",
              importInfo.range,
            ),
          );
        else defineUniformsImport = importInfo;
      },
    );
  }

  return {
    createFragmentShaderImport,
    defineUniformsImport,
    shaderCallableImports,
    sourceImports,
    diagnostics,
  };
}

function parseShdrImport(
  declaration: ImportDeclaration,
  diagnostics: ShaderDiagnostic[],
  shaderCallableImports: ShaderImportInfo[],
  setCreateFragmentShaderImport: (importInfo: ShaderImportInfo) => void,
  setDefineUniformsImport: (importInfo: ShaderImportInfo) => void,
): void {
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
    if (declaration.importKind === "type" || specifier.importKind === "type") {
      if (
        !SHADER_TYPE_IMPORTS.has(importedName) ||
        specifier.local.name !== importedName
      ) {
        diagnostics.push(
          diagnostic(
            ShaderDiagnosticCode.UnsupportedShdrImport,
            "Only direct supported expression/value type imports from shdr are allowed.",
            rangeOf(specifier),
          ),
        );
      }
      continue;
    }
    if (specifier.local.name !== importedName) {
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
    } else if (importedName === "defineUniforms") {
      setDefineUniformsImport(importInfo);
    } else if (importedName === "defineShaderFunction") {
      // Its declaration/callback boundary is recognized separately, never invoked.
    } else if (
      SUPPORTED_SHADER_CALLABLES.has(importedName) ||
      isShaderBuiltinName(importedName)
    ) {
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
    if (isShaderCall(current)) calls.push(current);
  });

  return calls;
}

function isShaderCall(node: Node): node is CallExpression {
  return isDirectShaderCall(node) || isChainedShaderCall(node);
}

function isChainedShaderCall(node: Node): node is CallExpression & {
  callee: { type: "MemberExpression"; object: CallExpression };
} {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === CREATE_FRAGMENT_SHADER &&
    node.callee.object.type === "CallExpression" &&
    node.callee.object.callee.type === "Identifier" &&
    node.callee.object.callee.name === "defineUniforms"
  );
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
  if (parameter.properties.length !== 2 && parameter.properties.length !== 1)
    return false;

  return parameter.properties.every((property, index) => {
    const expectedName =
      parameter.properties.length === 1
        ? "uniforms"
        : index === 0
          ? "coord"
          : "uniforms";

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
