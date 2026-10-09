import { parse } from "@babel/parser";
import type { File, ImportSpecifier, Node } from "@babel/types";

import {
  parseShaderFile,
  type ShaderFileInfo,
  type ShaderSourceImportInfo,
} from "./parse-shader-file.js";
import {
  parseShaderFunctions,
  SHADER_TYPE_IMPORTS,
} from "./parse-shader-functions.js";
import {
  parseCustomUniforms,
  type ParsedCustomUniforms,
} from "./parse-custom-uniforms.js";
import {
  ShaderDiagnosticCode,
  type ShaderDiagnostic,
  type ShaderGraphDiagnostic,
} from "./diagnostics.js";
import { lowerShaderBody, lowerShaderSyntax } from "./lower-shader-syntax.js";
import { reachableShaderFunctions } from "./lower-shader-functions.js";
import type { ShaderFunction, ShaderModule } from "./shader-ir.js";
import type {
  ShaderFunctionSyntax,
  ShaderExpressionSyntax,
  ShaderCallExpressionSyntax,
} from "./shader-syntax.js";
import type { TextRange } from "./source-range.js";

export interface ShaderVirtualGraphInput {
  readonly entry: string;
  readonly files:
    Readonly<Record<string, string>> | ReadonlyMap<string, string>;
  /** Effective, already-loaded TypeScript paths mappings. */
  readonly paths?: Readonly<Record<string, string | readonly string[]>>;
}

export interface LowerShaderGraphSuccess {
  readonly ok: true;
  readonly ir: ShaderModule;
  readonly diagnostics: readonly [];
}

export interface LowerShaderGraphFailure {
  readonly ok: false;
  readonly ir?: undefined;
  readonly diagnostics: readonly ShaderGraphDiagnostic[];
}

export interface CheckShaderGraphSuccess {
  readonly ok: true;
  readonly diagnostics: readonly [];
}

export interface CheckShaderGraphFailure {
  readonly ok: false;
  readonly diagnostics: readonly ShaderGraphDiagnostic[];
}

export type CheckShaderGraphResult =
  CheckShaderGraphSuccess | CheckShaderGraphFailure;

export type LowerShaderGraphResult =
  LowerShaderGraphSuccess | LowerShaderGraphFailure;

interface GraphModule {
  readonly id: string;
  readonly source: string;
  readonly fragment?: ShaderFileInfo;
  readonly functions: readonly ShaderFunctionSyntax[];
  readonly exportedFunctions: ReadonlySet<string>;
  readonly shaderCallableNames: ReadonlySet<string>;
  readonly uniformSchemas: ReadonlyMap<string, ParsedCustomUniforms>;
  readonly exportedUniforms: ReadonlySet<string>;
  readonly sourceImports: readonly ShaderSourceImportInfo[];
  readonly hasDefaultExport?: boolean;
  readonly entryDiagnostics?: readonly ShaderGraphDiagnostic[];
}

interface LoadedGraphModule extends GraphModule {
  readonly resolvedImports: ReadonlyMap<string, string>;
  readonly resolvedUniforms: ReadonlyMap<string, string>;
}

interface GraphDefinition {
  readonly key: string;
  readonly module: LoadedGraphModule;
  readonly syntax: ShaderFunctionSyntax;
}

interface VirtualFiles {
  readonly entries: ReadonlyMap<string, string>;
  readonly duplicate?: string;
}

/**
 * Lowers a browser-supplied, environment-neutral shader module graph. Hosts
 * resolve/load files; this function only applies the supplied path map.
 */
export function lowerShaderGraph(
  input: ShaderVirtualGraphInput,
): LowerShaderGraphResult {
  return lowerShaderGraphInternal(input, false) as LowerShaderGraphResult;
}

/** Validates all loaded helpers/schemas and an optional entry fragment without emitting an artifact. */
export function checkShaderGraph(
  input: ShaderVirtualGraphInput,
): CheckShaderGraphResult {
  return lowerShaderGraphInternal(input, true) as CheckShaderGraphResult;
}

function lowerShaderGraphInternal(
  input: ShaderVirtualGraphInput,
  checkOnly: boolean,
): LowerShaderGraphResult | CheckShaderGraphResult {
  const files = normalizeFiles(input.files);
  const entry = normalizeFileId(input.entry);
  if (files.duplicate) {
    return graphFailure([
      diagnostic(
        ShaderDiagnosticCode.DuplicateShaderFile,
        `Virtual file IDs ${JSON.stringify(files.duplicate)} normalize to the same file identity.`,
        entry,
        { start: 0, length: 0 },
      ),
    ]);
  }
  if (!files.entries.has(entry)) {
    return graphFailure([
      diagnostic(
        ShaderDiagnosticCode.MissingShaderModule,
        `Virtual shader module ${JSON.stringify(entry)} was not supplied.`,
        entry,
        { start: 0, length: 0 },
      ),
    ]);
  }

  const modules = new Map<string, GraphModule>();
  const loaded = new Map<string, LoadedGraphModule>();
  const active: string[] = [];
  const diagnostics: ShaderGraphDiagnostic[] = [];
  const paths = normalizePaths(input.paths, entry);

  const load = (id: string): GraphModule | undefined => {
    const existing = modules.get(id);
    if (existing) return existing;
    const source = files.entries.get(id);
    if (source === undefined) return undefined;
    const parsed =
      id === entry
        ? parseGraphModule(source, id)
        : parseGraphDependencyModule(source, id);
    if (!parsed.ok) {
      diagnostics.push(...parsed.diagnostics);
      return undefined;
    }
    modules.set(id, parsed.module);
    return parsed.module;
  };

  const visit = (id: string): boolean => {
    if (loaded.has(id)) return true;
    const module = load(id);
    if (!module) return false;
    if (active.includes(id)) return true;

    active.push(id);
    const resolved = new Map<string, string>();
    const resolvedUniforms = new Map<string, string>();
    let valid = true;
    for (const sourceImport of module.sourceImports) {
      const used = sourceImport.specifiers.some((specifier) =>
        moduleUsesName(module, specifier.localName),
      );
      const schemaUsed = sourceImport.specifiers.some((specifier) =>
        moduleUsesSchemaImport(module, specifier.localName),
      );
      const shouldResolve = shouldResolveImport(
        sourceImport.source,
        paths,
        used ||
          schemaUsed ||
          sourceImport.unsupportedSpecifierRanges.length > 0,
      );
      if (!shouldResolve) continue;
      if (sourceImport.unsupportedSpecifierRanges.length) {
        diagnostics.push(
          ...sourceImport.unsupportedSpecifierRanges.map((range) =>
            diagnostic(
              ShaderDiagnosticCode.UnsupportedShaderModuleImport,
              "Only direct named imports from shader source modules are supported.",
              id,
              range,
            ),
          ),
        );
        valid = false;
        continue;
      }

      const resolution = resolveImport(
        id,
        sourceImport.source,
        paths,
        files.entries,
      );
      if (!resolution.ok) {
        diagnostics.push(
          diagnostic(
            resolution.code,
            resolution.message,
            id,
            sourceImport.sourceRange,
          ),
        );
        valid = false;
        continue;
      }
      if (active.includes(resolution.id)) {
        const cycleStart = active.indexOf(resolution.id);
        const cycle = [...active.slice(cycleStart), resolution.id];
        diagnostics.push(
          diagnostic(
            ShaderDiagnosticCode.ShaderModuleCycle,
            `Shader module imports are cyclic: ${cycle.join(" → ")}.`,
            id,
            sourceImport.sourceRange,
          ),
        );
        valid = false;
        continue;
      }
      if (!visit(resolution.id)) {
        valid = false;
        continue;
      }
      const target = modules.get(resolution.id)!;
      for (const specifier of sourceImport.specifiers) {
        if (target.exportedFunctions.has(specifier.importedName)) {
          resolved.set(
            specifier.localName,
            `${resolution.id}#${specifier.importedName}`,
          );
        } else if (target.exportedUniforms.has(specifier.importedName)) {
          resolvedUniforms.set(
            specifier.localName,
            `${resolution.id}#${specifier.importedName}`,
          );
        } else {
          diagnostics.push(
            diagnostic(
              ShaderDiagnosticCode.MissingShaderExport,
              `Module ${JSON.stringify(resolution.id)} does not export shader helper or uniform schema ${JSON.stringify(specifier.importedName)}.`,
              id,
              specifier.range,
            ),
          );
          valid = false;
        }
      }
    }
    active.pop();
    if (!valid) return false;
    loaded.set(id, {
      ...module,
      resolvedImports: resolved,
      resolvedUniforms,
    });
    return true;
  };

  if (!visit(entry) || diagnostics.length) return graphFailure(diagnostics);

  const definitions = new Map<string, GraphDefinition>();
  for (const module of loaded.values()) {
    for (const syntax of module.functions) {
      const key = `${module.id}#${syntax.name}`;
      definitions.set(key, { key, module, syntax });
    }
  }
  const ids = new Map(
    [...definitions.keys()].sort().map((key, index) => [key, index]),
  );
  const lowered = new Map<string, ShaderFunction>();
  const activeFunctions: string[] = [];

  const resolveFunction = (
    module: LoadedGraphModule,
    name: string,
  ): string | undefined => {
    if (module.functions.some((function_) => function_.name === name))
      return `${module.id}#${name}`;
    return module.resolvedImports.get(name);
  };

  const lowerFunction = (
    key: string,
    call?: ShaderCallExpressionSyntax,
  ): boolean => {
    if (lowered.has(key)) return true;
    const definition = definitions.get(key);
    if (!definition) return false;
    const cycleIndex = activeFunctions.indexOf(key);
    if (cycleIndex >= 0) {
      diagnostics.push(
        diagnostic(
          ShaderDiagnosticCode.RecursiveShaderFunction,
          `Recursive shader helpers are unsupported: ${[
            ...activeFunctions.slice(cycleIndex),
            key,
          ].join(" → ")}.`,
          definition.module.id,
          call?.range ?? definition.syntax.range,
        ),
      );
      return false;
    }

    activeFunctions.push(key);
    const calls = definition.syntax.body.declarations
      .map((item) => item.initializer)
      .concat(definition.syntax.body.returnExpression)
      .flatMap(syntaxCalls);
    for (const callExpression of calls) {
      const dependency = resolveFunction(
        definition.module,
        callExpression.calleeName,
      );
      if (
        dependency !== undefined &&
        !lowerFunction(dependency, callExpression)
      ) {
        activeFunctions.pop();
        return false;
      }
    }

    const functions = new Map<string, ShaderFunction>();
    for (const syntax of definition.module.functions) {
      const localKey = `${definition.module.id}#${syntax.name}`;
      const function_ = lowered.get(localKey);
      if (function_) functions.set(syntax.name, function_);
    }
    for (const [localName, importedKey] of definition.module.resolvedImports) {
      const function_ = lowered.get(importedKey);
      if (function_) functions.set(localName, function_);
    }
    const parameterNames = new Set([
      ...definition.module.shaderCallableNames,
      ...definition.module.functions.map((item) => item.name),
      ...definition.module.sourceImports.flatMap((item) =>
        item.specifiers.map((specifier) => specifier.localName),
      ),
    ]);
    const parameters = definition.syntax.parameters.map(
      (parameter, symbolId) => ({
        ...parameter,
        symbolId,
      }),
    );
    const body = lowerShaderBody(definition.syntax.body, parameterNames, [], {
      parameters,
      functions,
    });
    if (!body.ok) {
      diagnostics.push(
        ...body.diagnostics.map((item) =>
          withFileName(item, definition.module.id),
        ),
      );
      activeFunctions.pop();
      return false;
    }
    if (
      definition.syntax.returnType &&
      !sameShaderType(definition.syntax.returnType, body.returnType)
    ) {
      diagnostics.push(
        diagnostic(
          ShaderDiagnosticCode.InvalidReturnType,
          `Helper ${JSON.stringify(definition.syntax.name)} return expression does not match its annotated return type.`,
          definition.module.id,
          definition.syntax.body.returnExpression.range,
        ),
      );
      activeFunctions.pop();
      return false;
    }
    lowered.set(key, {
      functionId: ids.get(key)!,
      name: definition.syntax.name,
      parameters,
      returnType: body.returnType,
      statements: body.statements,
      range: definition.syntax.range,
    });
    activeFunctions.pop();
    return true;
  };

  for (const definition of definitions.values()) {
    if (!lowerFunction(definition.key)) return graphFailure(diagnostics);
  }

  const root = loaded.get(entry)!;
  if (!root.fragment) {
    if (
      checkOnly &&
      !root.hasDefaultExport &&
      (root.functions.length || root.uniformSchemas.size)
    ) {
      return { ok: true, diagnostics: [] };
    }
    if (checkOnly && root.entryDiagnostics?.length) {
      return graphFailure(root.entryDiagnostics);
    }
    if (checkOnly && (root.functions.length || root.uniformSchemas.size)) {
      return { ok: true, diagnostics: [] };
    }
    if (checkOnly) {
      diagnostics.push(
        diagnostic(
          ShaderDiagnosticCode.MissingDefaultExport,
          "The graph entry must contain a helper/schema declaration or a default-exported createFragmentShader(...) call.",
          entry,
          { start: 0, length: 0 },
        ),
      );
      return graphFailure(diagnostics);
    }
    diagnostics.push(
      diagnostic(
        ShaderDiagnosticCode.MissingDefaultExport,
        "The graph entry must contain a default-exported createFragmentShader(...) call.",
        entry,
        { start: 0, length: 0 },
      ),
    );
    return graphFailure(diagnostics);
  }
  const importedCallables = new Set([
    ...root.fragment.shaderCallableImports.map((item) => item.localName),
    ...root.sourceImports.flatMap((item) =>
      item.specifiers.map((specifier) => specifier.localName),
    ),
  ]);
  const rootFunctions = new Map<string, ShaderFunction>();
  for (const syntax of root.functions) {
    const function_ = lowered.get(`${entry}#${syntax.name}`);
    if (function_) rootFunctions.set(syntax.name, function_);
  }
  for (const [localName, key] of root.resolvedImports) {
    const function_ = lowered.get(key);
    if (function_) rootFunctions.set(localName, function_);
  }
  const importedSchemaKey = root.fragment.customUniformsImport
    ? root.resolvedUniforms.get(root.fragment.customUniformsImport.localName)
    : undefined;
  const importedSchema = importedSchemaKey
    ? schemaForKey(importedSchemaKey, loaded)
    : undefined;
  if (root.fragment.customUniformsImport && !importedSchema) {
    return graphFailure([
      diagnostic(
        ShaderDiagnosticCode.MissingShaderExport,
        "The selected imported uniforms schema could not be resolved.",
        entry,
        root.fragment.customUniformsImport.range,
      ),
    ]);
  }
  const customUniforms =
    root.fragment.customUniforms?.declarations ?? importedSchema?.declarations;
  const fragment = lowerShaderSyntax(
    root.fragment.callback.syntax,
    importedCallables,
    customUniforms,
    { functions: rootFunctions },
  );
  if (!fragment.ok) {
    return graphFailure(
      fragment.diagnostics.map((item) => withFileName(item, entry)),
    );
  }
  const functions = reachableShaderFunctions(
    fragment.module.statements,
    lowered,
  );
  return {
    ok: true,
    ir: functions.length ? { ...fragment.module, functions } : fragment.module,
    diagnostics: [],
  };
}

function parseGraphModule(
  source: string,
  id: string,
):
  | { readonly ok: true; readonly module: GraphModule }
  | LowerShaderGraphFailure {
  const parsed = parseShaderFile(source, id);
  if (parsed.info) {
    const file = parseSource(source, id);
    if (!file.ok) return file;
    return {
      ok: true,
      module: {
        id,
        source,
        fragment: parsed.info,
        functions: parsed.info.functions ?? [],
        exportedFunctions: exportedFunctionNames(
          file.file,
          parsed.info.functions ?? [],
        ),
        shaderCallableNames: new Set(
          parsed.info.shaderCallableImports.map((item) => item.localName),
        ),
        uniformSchemas: new Map(),
        exportedUniforms: new Set(),
        sourceImports: parsed.info.sourceImports,
        hasDefaultExport: true,
      },
    };
  }
  const fatal = parsed.diagnostics.filter(
    (item) =>
      item.code !== ShaderDiagnosticCode.MissingCreateFragmentShaderImport &&
      item.code !== ShaderDiagnosticCode.MissingDefaultExport,
  );
  if (fatal.length)
    return graphFailure(fatal.map((item) => withFileName(item, id)));

  const dependency = parseGraphDependencyModule(source, id);
  if (!dependency.ok) return dependency;
  return {
    ok: true,
    module: {
      ...dependency.module,
      entryDiagnostics: parsed.diagnostics.map((item) =>
        withFileName(item, id),
      ),
    },
  };
}

function parseGraphDependencyModule(
  source: string,
  id: string,
):
  | { readonly ok: true; readonly module: GraphModule }
  | LowerShaderGraphFailure {
  const file = parseSource(source, id);
  if (!file.ok) return file;
  const sourceImports = collectSourceImports(file.file);
  const markerImported = file.file.program.body.some(
    (statement) =>
      statement.type === "ImportDeclaration" &&
      statement.source.value === "shdr" &&
      statement.importKind !== "type" &&
      statement.specifiers.some(
        (specifier) =>
          specifier.type === "ImportSpecifier" &&
          specifier.importKind !== "type" &&
          importedNameOf(specifier) === "defineShaderFunction" &&
          specifier.local.name === "defineShaderFunction",
      ),
  );
  const typeImports = new Set(
    file.file.program.body.flatMap((statement) =>
      statement.type === "ImportDeclaration" &&
      statement.source.value === "shdr"
        ? statement.specifiers.flatMap((specifier) =>
            specifier.type === "ImportSpecifier" &&
            (statement.importKind === "type" || specifier.importKind === "type")
              ? SHADER_TYPE_IMPORTS.has(importedNameOf(specifier))
                ? [importedNameOf(specifier)]
                : []
              : [],
          )
        : [],
    ),
  );
  const shdrCallables = new Set(
    file.file.program.body.flatMap((statement) =>
      statement.type === "ImportDeclaration" &&
      statement.source.value === "shdr"
        ? statement.specifiers.flatMap((specifier) =>
            specifier.type === "ImportSpecifier" &&
            statement.importKind !== "type" &&
            specifier.importKind !== "type" &&
            importedNameOf(specifier) !== "defineShaderFunction"
              ? [specifier.local.name]
              : [],
          )
        : [],
    ),
  );
  const schemas = parseUniformSchemas(file.file, shdrCallables, id);
  if (!schemas.ok) return schemas;
  const helpers = parseShaderFunctions(
    file.file,
    markerImported,
    typeImports,
    new Set([
      ...shdrCallables,
      ...sourceImports.flatMap((item) =>
        item.specifiers.map((specifier) => specifier.localName),
      ),
    ]),
  );
  if (helpers.diagnostics.length)
    return graphFailure(
      helpers.diagnostics.map((item) => withFileName(item, id)),
    );
  return {
    ok: true,
    module: {
      id,
      source,
      functions: helpers.functions,
      exportedFunctions: exportedFunctionNames(file.file, helpers.functions),
      shaderCallableNames: shdrCallables,
      uniformSchemas: schemas.value,
      exportedUniforms: exportedUniformNames(file.file, schemas.value),
      sourceImports,
      hasDefaultExport: file.file.program.body.some(
        (statement) => statement.type === "ExportDefaultDeclaration",
      ),
    },
  };
}

function parseSource(
  source: string,
  fileName: string,
): { readonly ok: true; readonly file: File } | LowerShaderGraphFailure {
  try {
    const file = parse(source, {
      createParenthesizedExpressions: true,
      errorRecovery: true,
      plugins: ["typescript"],
      ranges: true,
      sourceFilename: fileName,
      sourceType: "module",
    });
    if (file.errors.length) {
      return graphFailure(
        file.errors.map((error) =>
          diagnostic(
            ShaderDiagnosticCode.TypeScriptSyntax,
            error.message,
            fileName,
            { start: error.pos, length: 1 },
          ),
        ),
      );
    }
    return { ok: true, file };
  } catch (error) {
    return graphFailure([
      diagnostic(
        ShaderDiagnosticCode.TypeScriptSyntax,
        error instanceof Error
          ? error.message
          : "Unable to parse TypeScript source.",
        fileName,
        { start: 0, length: 0 },
      ),
    ]);
  }
}

function collectSourceImports(file: File): readonly ShaderSourceImportInfo[] {
  return file.program.body.flatMap((statement) => {
    if (
      statement.type !== "ImportDeclaration" ||
      statement.source.value === "shdr" ||
      statement.importKind !== "value"
    )
      return [];
    if (
      !statement.specifiers.some(
        (specifier) =>
          specifier.type !== "ImportSpecifier" ||
          specifier.importKind !== "type",
      )
    )
      return [];
    const specifiers = statement.specifiers.flatMap((specifier) =>
      specifier.type === "ImportSpecifier" && specifier.importKind !== "type"
        ? [
            {
              importedName: importedNameOf(specifier),
              localName: specifier.local.name,
              range: rangeOf(specifier),
            },
          ]
        : [],
    );
    return [
      {
        source: statement.source.value,
        sourceRange: rangeOf(statement.source),
        specifiers,
        unsupportedSpecifierRanges: statement.specifiers.flatMap((specifier) =>
          specifier.type === "ImportSpecifier" ? [] : [rangeOf(specifier)],
        ),
      },
    ];
  });
}

function parseUniformSchemas(
  file: File,
  shaderCallables: ReadonlySet<string>,
  fileName: string,
):
  | {
      readonly ok: true;
      readonly value: ReadonlyMap<string, ParsedCustomUniforms>;
    }
  | LowerShaderGraphFailure {
  const schemas = new Map<string, ParsedCustomUniforms>();
  if (!shaderCallables.has("defineUniforms"))
    return { ok: true, value: schemas };
  for (const statement of file.program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    if (
      declaration?.type !== "VariableDeclaration" ||
      declaration.kind !== "const" ||
      declaration.declarations.length !== 1
    )
      continue;
    const item = declaration.declarations[0];
    if (
      item?.id.type !== "Identifier" ||
      item.init?.type !== "CallExpression" ||
      item.init.callee.type !== "Identifier" ||
      item.init.callee.name !== "defineUniforms"
    )
      continue;
    const parsed = parseCustomUniforms(item.init);
    if (!parsed.ok)
      return {
        ok: false,
        diagnostics: parsed.diagnostics.map((item) =>
          withFileName(item, fileName),
        ),
      };
    schemas.set(item.id.name, parsed.value);
  }
  return { ok: true, value: schemas };
}

function exportedFunctionNames(
  file: File,
  functions: readonly ShaderFunctionSyntax[],
): ReadonlySet<string> {
  const recognized = new Set(functions.map((function_) => function_.name));
  const names = new Set<string>();
  for (const statement of file.program.body) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    const declaration = statement.declaration;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const item of declaration.declarations) {
      if (
        item.id.type === "Identifier" &&
        item.init?.type === "CallExpression" &&
        item.init.callee.type === "Identifier" &&
        item.init.callee.name === "defineShaderFunction" &&
        recognized.has(item.id.name)
      )
        names.add(item.id.name);
    }
  }
  return names;
}

function exportedUniformNames(
  file: File,
  schemas: ReadonlyMap<string, ParsedCustomUniforms>,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of file.program.body) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    const declaration = statement.declaration;
    if (
      declaration?.type !== "VariableDeclaration" ||
      declaration.kind !== "const" ||
      declaration.declarations.length !== 1
    )
      continue;
    const item = declaration.declarations[0];
    if (
      item?.id.type === "Identifier" &&
      item.init?.type === "CallExpression" &&
      item.init.callee.type === "Identifier" &&
      item.init.callee.name === "defineUniforms" &&
      schemas.has(item.id.name)
    )
      names.add(item.id.name);
  }
  return names;
}

function schemaForKey(
  key: string,
  modules: ReadonlyMap<string, LoadedGraphModule>,
): ParsedCustomUniforms | undefined {
  const separator = key.lastIndexOf("#");
  if (separator < 0) return undefined;
  return modules
    .get(key.slice(0, separator))
    ?.uniformSchemas.get(key.slice(separator + 1));
}

function importedNameOf(specifier: ImportSpecifier): string {
  return specifier.imported.type === "Identifier"
    ? specifier.imported.name
    : specifier.imported.value;
}

function moduleUsesSchemaImport(module: GraphModule, name: string): boolean {
  return module.fragment?.customUniformsImport?.localName === name;
}

function moduleUsesName(module: GraphModule, name: string): boolean {
  const expressions = [
    ...(module.fragment
      ? [module.fragment.callback.syntax.returnExpression]
      : []),
    ...(module.fragment?.callback.syntax.declarations.flatMap(
      (item) => item.initializer,
    ) ?? []),
    ...module.functions.flatMap((item) => [
      ...item.body.declarations.map((declaration) => declaration.initializer),
      item.body.returnExpression,
    ]),
  ];
  return expressions.some((expression) =>
    syntaxCalls(expression).some((call) => call.calleeName === name),
  );
}

function shouldResolveImport(
  source: string,
  paths: readonly PathMapping[],
  used: boolean,
): boolean {
  return source.startsWith("./") || source.startsWith("../")
    ? source.endsWith(".shdr.ts") || used
    : paths.some((mapping) => mapping.matches(source)) || used;
}

interface PathMapping {
  readonly pattern: string;
  readonly targets: readonly string[];
  readonly prefixLength: number;
  readonly wildcard: boolean;
  matches(source: string): boolean;
  substitute(source: string): readonly string[];
}

function normalizePaths(
  input: ShaderVirtualGraphInput["paths"],
  entry: string,
): readonly PathMapping[] {
  if (!input) return [];
  return Object.entries(input).flatMap(([pattern, value]) => {
    const rawTargets = typeof value === "string" ? [value] : [...value];
    const wildcard = pattern.indexOf("*") >= 0;
    if (wildcard && pattern.indexOf("*") !== pattern.lastIndexOf("*"))
      return [];
    const prefixLength = wildcard ? pattern.indexOf("*") : pattern.length;
    const targets = rawTargets.map((target) =>
      target.startsWith("/") || /^[A-Za-z]:\//.test(target)
        ? normalizeFileId(target)
        : normalizeFileId(`${dirname(entry)}/${target}`),
    );
    return [
      {
        pattern,
        targets,
        prefixLength,
        wildcard,
        matches(source: string) {
          if (!wildcard) return source === pattern;
          const [prefix, suffix] = pattern.split("*") as [string, string];
          return source.startsWith(prefix) && source.endsWith(suffix);
        },
        substitute(source: string) {
          if (!wildcard) return targets;
          const [prefix, suffix] = pattern.split("*") as [string, string];
          const star = source.slice(
            prefix.length,
            source.length - suffix.length,
          );
          return targets.map((target) => target.replace("*", star));
        },
      } satisfies PathMapping,
    ];
  });
}

function resolveImport(
  importer: string,
  source: string,
  paths: readonly PathMapping[],
  files: ReadonlyMap<string, string>,
):
  | { readonly ok: true; readonly id: string }
  | {
      readonly ok: false;
      readonly code: ShaderDiagnosticCode;
      readonly message: string;
    } {
  if (source.startsWith("./") || source.startsWith("../")) {
    if (!source.endsWith(".shdr.ts"))
      return unsupported(
        source,
        "Relative shader imports must explicitly name a .shdr.ts file.",
      );
    const id = normalizeFileId(`${dirname(importer)}/${source}`);
    return files.has(id) ? { ok: true, id } : missing(id);
  }

  const matching = paths.filter((mapping) => mapping.matches(source));
  const exact = matching.find((mapping) => !mapping.wildcard);
  const selected =
    exact ??
    [...matching].sort(
      (left, right) => right.prefixLength - left.prefixLength,
    )[0];
  if (!selected)
    return unsupported(
      source,
      "Non-relative shader imports must match an effective paths mapping.",
    );
  for (const target of selected.substitute(source)) {
    if (!target.endsWith(".shdr.ts"))
      return unsupported(
        source,
        "Shader path targets must identify a .shdr.ts file.",
      );
    if (files.has(target)) return { ok: true, id: target };
  }
  return missing(source);
}

function unsupported(source: string, reason: string) {
  return {
    ok: false as const,
    code: ShaderDiagnosticCode.UnsupportedShaderModuleImport,
    message: `Unsupported shader import ${JSON.stringify(source)}: ${reason}`,
  };
}

function missing(source: string) {
  return {
    ok: false as const,
    code: ShaderDiagnosticCode.MissingShaderModule,
    message: `Shader module ${JSON.stringify(source)} could not be found in the supplied virtual files.`,
  };
}

function syntaxCalls(
  expression: ShaderExpressionSyntax,
): readonly ShaderCallExpressionSyntax[] {
  switch (expression.kind) {
    case "call-expression":
      return [expression, ...expression.arguments.flatMap(syntaxCalls)];
    case "binary-expression":
      return [
        ...syntaxCalls(expression.left),
        ...syntaxCalls(expression.right),
      ];
    case "unary-expression":
      return syntaxCalls(expression.argument);
    case "parenthesized-expression":
      return syntaxCalls(expression.expression);
    case "property-access":
      return syntaxCalls(expression.object);
    case "identifier":
    case "numeric-literal":
      return [];
    default:
      return [];
  }
}

function sameShaderType(
  left: { readonly kind: string; readonly size?: number },
  right: { readonly kind: string; readonly size?: number },
): boolean {
  return (
    left.kind === right.kind &&
    (left.kind !== "vector" || left.size === right.size)
  );
}

function normalizeFiles(files: ShaderVirtualGraphInput["files"]): VirtualFiles {
  const entries = new Map<string, string>();
  const values = files instanceof Map ? files.entries() : Object.entries(files);
  for (const [fileName, source] of values) {
    const id = normalizeFileId(fileName);
    if (entries.has(id)) return { entries, duplicate: id };
    entries.set(id, source);
  }
  return { entries };
}

function normalizeFileId(fileName: string): string {
  const slash = fileName.replaceAll("\\", "/");
  const absolute = /^[A-Za-z]:\//.test(slash) || slash.startsWith("/");
  const prefix = /^[A-Za-z]:\//.test(slash) ? slash.slice(0, 3) : "/";
  const body = absolute ? slash.slice(prefix.length) : slash;
  const parts: string[] = [];
  for (const part of body.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length && parts.at(-1) !== "..") parts.pop();
      else if (!absolute) parts.push(part);
    } else parts.push(part);
  }
  return `${prefix}${parts.join("/")}`;
}

function dirname(fileName: string): string {
  const index = fileName.lastIndexOf("/");
  return index <= 0 ? "/" : fileName.slice(0, index);
}

function diagnostic(
  code: ShaderDiagnosticCode,
  message: string,
  fileName: string,
  range: TextRange,
): ShaderGraphDiagnostic {
  return { code, message, range, severity: "error", fileName };
}

function withFileName(
  diagnosticValue: ShaderDiagnostic,
  fileName: string,
): ShaderGraphDiagnostic {
  return { ...diagnosticValue, fileName };
}

function graphFailure(
  diagnostics: readonly ShaderGraphDiagnostic[],
): LowerShaderGraphFailure {
  return { ok: false, diagnostics };
}

function rangeOf(node: Node): TextRange {
  const start = node.start ?? 0;
  return { start, length: (node.end ?? start) - start };
}
