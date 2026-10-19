import { parse, type ParseError } from "@babel/parser";
import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  File,
  Identifier,
  ImportDeclaration,
  Node,
  VariableDeclaration,
  VariableDeclarator,
} from "@babel/types";

import { ShaderDiagnosticCode, type ShaderDiagnostic } from "./diagnostics.js";
import { isFiniteF32 } from "./finite-f32.js";
import { isSafeShaderLocalName } from "./shader-reserved-name.js";
import type { TextRange } from "./source-range.js";

const CONSTRUCTOR_NAMES = new Set(["vec2", "vec3", "vec4"]);
const SHADER_CONTEXT_NAMES = new Set(["coord", "uniforms"]);

export type ModuleConstantType =
  | { readonly kind: "scalar"; readonly scalar: "f32" }
  | {
      readonly kind: "vector";
      readonly scalar: "f32";
      readonly size: 2 | 3 | 4;
    };

export type ModuleConstantInitializer =
  | {
      readonly kind: "literal";
      readonly value: number;
      readonly type: ModuleConstantType;
      readonly range: TextRange;
    }
  | {
      readonly kind: "reference";
      readonly name: string;
      readonly type: ModuleConstantType;
      readonly range: TextRange;
    }
  | {
      readonly kind: "constructor";
      readonly name: "vec2" | "vec3" | "vec4";
      readonly arguments: readonly ModuleConstantInitializer[];
      readonly type: ModuleConstantType;
      readonly range: TextRange;
    };

export interface ModuleConstantDefinition {
  readonly name: string;
  readonly nameRange: TextRange;
  readonly declarationRange: TextRange;
  readonly initializer: ModuleConstantInitializer;
  readonly type: ModuleConstantType;
}

export interface ModuleConstantReference {
  readonly name: string;
  readonly range: TextRange;
}

/** Returns eligible-name candidates without validating their initializers. */
export function collectTopLevelModuleConstantNames(
  file: File,
): ReadonlySet<string> {
  return new Set(collectDefinitions(file).keys());
}

/** Returns declaration ranges for the referenced top-level constant candidates. */
export function collectTopLevelModuleConstantRanges(
  file: File,
  names: ReadonlySet<string>,
): readonly TextRange[] {
  return [...collectDefinitions(file).values()]
    .flatMap((definitions) => definitions)
    .filter((definition) => names.has(definition.name))
    .map((definition) => definition.declarationRange);
}

/** Collects only candidate module names from shader expression regions. */
export function collectModuleConstantReferences(
  callback: ArrowFunctionExpression,
  candidateNames: ReadonlySet<string>,
  boundNames: ReadonlySet<string>,
): readonly ModuleConstantReference[] {
  const references: ModuleConstantReference[] = [];
  const seen = new Set<string>();
  const add = (node: Identifier): void => {
    if (!candidateNames.has(node.name) || boundNames.has(node.name)) return;
    const range = rangeOf(node);
    const key = `${node.name}:${range.start}`;
    if (seen.has(key)) return;
    seen.add(key);
    references.push({ name: node.name, range });
  };
  const visit = (node: Expression): void => {
    switch (node.type) {
      case "Identifier":
        add(node);
        return;
      case "ParenthesizedExpression":
        visit(node.expression);
        return;
      case "BinaryExpression":
        visit(node.left as Expression);
        visit(node.right as Expression);
        return;
      case "UnaryExpression":
        visit(node.argument);
        return;
      case "CallExpression":
        if (node.callee.type === "Identifier") add(node.callee);
        else if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type !== "Super"
        )
          visit(node.callee.object as Expression);
        for (const argument of node.arguments) {
          if (
            argument.type !== "SpreadElement" &&
            argument.type !== "ArgumentPlaceholder"
          )
            visit(argument);
        }
        return;
      case "MemberExpression":
        if (node.object.type !== "Super") visit(node.object as Expression);
        return;
      default:
        return;
    }
  };

  const visitStatement = (statement: Node): void => {
    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations) {
        if (declaration.init) visit(declaration.init);
      }
    } else if (statement.type === "ReturnStatement" && statement.argument) {
      visit(statement.argument);
    }
  };

  if (callback.body.type === "BlockStatement") {
    for (const statement of callback.body.body) visitStatement(statement);
  } else {
    visit(callback.body);
  }
  return references;
}

/** Collects callback parameters and shader-local declaration names. */
export function collectShaderLocalNames(
  callback: ArrowFunctionExpression,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const parameter of callback.params) {
    if (parameter.type === "Identifier") names.add(parameter.name);
    else if (parameter.type === "ObjectPattern") {
      for (const property of parameter.properties) {
        if (
          property.type === "ObjectProperty" &&
          property.key.type === "Identifier"
        )
          names.add(property.key.name);
      }
    }
  }
  if (callback.body.type === "BlockStatement") {
    for (const statement of callback.body.body) {
      if (statement.type !== "VariableDeclaration") continue;
      for (const declaration of statement.declarations) {
        if (declaration.id.type === "Identifier")
          names.add(declaration.id.name);
      }
    }
  }
  return names;
}

export interface ParseModuleConstantsOptions {
  /** Additional direct constructor local names supplied by the parsed shader boundary. */
  readonly constructorNames?: ReadonlySet<string>;
  /** Names that cannot become generated shader constants in this source. */
  readonly conflictingNames?: ReadonlySet<string>;
}

export interface ParseModuleConstantsSuccess {
  readonly ok: true;
  readonly constants: ReadonlyMap<string, ModuleConstantDefinition>;
  readonly diagnostics: readonly [];
}

export interface ParseModuleConstantsFailure {
  readonly ok: false;
  readonly diagnostics: readonly ShaderDiagnostic[];
}

export type ParseModuleConstantsResult =
  ParseModuleConstantsSuccess | ParseModuleConstantsFailure;

interface TopLevelConstant {
  readonly name: string;
  readonly nameRange: TextRange;
  readonly declarationRange: TextRange;
  readonly declaration: VariableDeclarator;
  readonly simpleDeclaration: boolean;
  readonly sourceStart: number;
}

interface ParsedBindings {
  readonly constructorNames: ReadonlySet<string>;
  readonly conflictingNames: ReadonlySet<string>;
}

interface ResolveContext {
  readonly definitions: ReadonlyMap<string, readonly TopLevelConstant[]>;
  readonly parsedBindings: ParsedBindings;
  readonly resolved: Map<string, ModuleConstantDefinition>;
  readonly active: Set<string>;
}

interface InitializerResult {
  readonly ok: true;
  readonly initializer: ModuleConstantInitializer;
}

interface InitializerFailure {
  readonly ok: false;
  readonly diagnostic: ShaderDiagnostic;
}

type InitializerResultOrFailure = InitializerResult | InitializerFailure;

/**
 * Classifies only requested top-level constants without evaluating authored
 * source. Unrequested host declarations are deliberately not inspected.
 */
export function parseModuleConstants(
  source: string,
  references: readonly ModuleConstantReference[],
  options: ParseModuleConstantsOptions = {},
): ParseModuleConstantsResult {
  const parsed = parseSource(source);
  if (!parsed.ok) return parsed;

  const bindings = collectBindings(parsed.file, options);
  const definitions = collectDefinitions(parsed.file);
  const context: ResolveContext = {
    definitions,
    parsedBindings: bindings,
    resolved: new Map(),
    active: new Set(),
  };

  for (const reference of references) {
    const result = resolveReference(reference, context);
    if (!result.ok) return result;
  }

  const constants = new Map<string, ModuleConstantDefinition>();
  for (const reference of references) {
    const constant = context.resolved.get(reference.name);
    if (constant) constants.set(reference.name, constant);
  }
  for (const [name, constant] of context.resolved) {
    if (!constants.has(name)) constants.set(name, constant);
  }

  return { ok: true, constants, diagnostics: [] };
}

function resolveReference(
  reference: ModuleConstantReference,
  context: ResolveContext,
): ParseModuleConstantsSuccess | ParseModuleConstantsFailure {
  const candidates = context.definitions.get(reference.name);
  if (!candidates?.length) {
    return failure(
      ShaderDiagnosticCode.ClosureCapture,
      `Module constant ${JSON.stringify(reference.name)} must name an eligible same-file top-level const declaration.`,
      reference.range,
    );
  }
  if (candidates.length > 1) {
    return failure(
      ShaderDiagnosticCode.DuplicateLocal,
      `Module constant ${JSON.stringify(reference.name)} is declared more than once.`,
      candidates[1]!.nameRange,
    );
  }

  const definition = candidates[0]!;
  if (definition.sourceStart >= reference.range.start) {
    return failure(
      ShaderDiagnosticCode.ForwardReference,
      `Module constant ${JSON.stringify(reference.name)} cannot be referenced before its declaration.`,
      reference.range,
    );
  }

  return resolveDefinition(definition, context);
}

function resolveDefinition(
  definition: TopLevelConstant,
  context: ResolveContext,
): ParseModuleConstantsSuccess | ParseModuleConstantsFailure {
  const existing = context.resolved.get(definition.name);
  if (existing) return { ok: true, constants: new Map(), diagnostics: [] };

  if (context.active.has(definition.name)) {
    return failure(
      ShaderDiagnosticCode.ForwardReference,
      `Module constant ${JSON.stringify(definition.name)} cannot reference itself or a cyclic alias.`,
      definition.nameRange,
    );
  }

  if (
    !isSafeShaderLocalName(definition.name) ||
    SHADER_CONTEXT_NAMES.has(definition.name) ||
    context.parsedBindings.conflictingNames.has(definition.name)
  ) {
    return failure(
      ShaderDiagnosticCode.DuplicateLocal,
      `Module constant ${JSON.stringify(definition.name)} conflicts with a shader binding or generated name.`,
      definition.nameRange,
    );
  }

  if (!definition.simpleDeclaration) {
    return failure(
      ShaderDiagnosticCode.InvalidVariableDeclaration,
      "Module constants require one simple unannotated const declaration.",
      definition.declarationRange,
    );
  }
  if (!definition.declaration.init) {
    return failure(
      ShaderDiagnosticCode.InvalidVariableDeclaration,
      `Module constant ${JSON.stringify(definition.name)} requires an initializer.`,
      definition.declarationRange,
    );
  }

  context.active.add(definition.name);
  const initializer = parseInitializer(
    definition.declaration.init,
    definition,
    context,
  );
  context.active.delete(definition.name);
  if (!initializer.ok) {
    return failure(
      initializer.diagnostic.code,
      initializer.diagnostic.message,
      initializer.diagnostic.range,
    );
  }

  const resolved: ModuleConstantDefinition = {
    name: definition.name,
    nameRange: definition.nameRange,
    declarationRange: definition.declarationRange,
    initializer: initializer.initializer,
    type: initializer.initializer.type,
  };
  context.resolved.set(definition.name, resolved);
  return { ok: true, constants: new Map(), diagnostics: [] };
}

function parseInitializer(
  node: NonNullable<VariableDeclarator["init"]>,
  definition: TopLevelConstant,
  context: ResolveContext,
): InitializerResultOrFailure {
  const range = rangeOf(node);
  switch (node.type) {
    case "NumericLiteral":
      if (!isFiniteF32(node.value)) {
        return initializerFailure(
          ShaderDiagnosticCode.InvalidNumericLiteral,
          "Module constant numeric literals must be finite without f32 overflow.",
          range,
        );
      }
      return {
        ok: true,
        initializer: {
          kind: "literal",
          value: node.value,
          type: scalarType(),
          range,
        },
      };

    case "UnaryExpression":
      if (node.operator !== "-" || node.argument.type !== "NumericLiteral") {
        return initializerFailure(
          ShaderDiagnosticCode.UnsupportedExpression,
          "Module constant initializers allow only numeric literals, earlier constants, and vec2/vec3/vec4 constructors.",
          range,
        );
      }
      if (!isFiniteF32(-node.argument.value)) {
        return initializerFailure(
          ShaderDiagnosticCode.InvalidNumericLiteral,
          "Module constant numeric literals must be finite without f32 overflow.",
          range,
        );
      }
      return {
        ok: true,
        initializer: {
          kind: "literal",
          value: -node.argument.value,
          type: scalarType(),
          range,
        },
      };

    case "BinaryExpression":
      return initializerFailure(
        ShaderDiagnosticCode.UnsupportedOperator,
        "Module constant initializers do not support arithmetic.",
        range,
      );

    case "Identifier": {
      const result = resolveIdentifier(node, definition, context);
      if (!result.ok) return result;
      return {
        ok: true,
        initializer: {
          kind: "reference",
          name: node.name,
          type: result.type,
          range,
        },
      };
    }

    case "CallExpression":
      return parseConstructor(node, definition, context);

    default:
      return initializerFailure(
        ShaderDiagnosticCode.UnsupportedExpression,
        "Module constant initializers allow only numeric literals, earlier constants, and vec2/vec3/vec4 constructors.",
        range,
      );
  }
}

function resolveIdentifier(
  node: Identifier,
  definition: TopLevelConstant,
  context: ResolveContext,
):
  | { readonly ok: true; readonly type: ModuleConstantType }
  | InitializerFailure {
  const candidates = context.definitions.get(node.name);
  if (!candidates?.length) {
    return initializerFailure(
      ShaderDiagnosticCode.ClosureCapture,
      `Module constant initializers cannot capture outer identifier ${JSON.stringify(node.name)}.`,
      rangeOf(node),
    );
  }
  if (candidates.length > 1) {
    return initializerFailure(
      ShaderDiagnosticCode.DuplicateLocal,
      `Module constant ${JSON.stringify(node.name)} is declared more than once.`,
      candidates[1]!.nameRange,
    );
  }

  const dependency = candidates[0]!;
  if (dependency.sourceStart >= definition.sourceStart) {
    return initializerFailure(
      ShaderDiagnosticCode.ForwardReference,
      `Module constant ${JSON.stringify(node.name)} must be declared before ${JSON.stringify(definition.name)}.`,
      rangeOf(node),
    );
  }

  const lowered = resolveDefinition(dependency, context);
  if (!lowered.ok) return { ok: false, diagnostic: lowered.diagnostics[0]! };
  return { ok: true, type: context.resolved.get(node.name)!.type };
}

function parseConstructor(
  node: CallExpression,
  definition: TopLevelConstant,
  context: ResolveContext,
): InitializerResultOrFailure {
  if (
    node.callee.type !== "Identifier" ||
    !CONSTRUCTOR_NAMES.has(node.callee.name) ||
    !context.parsedBindings.constructorNames.has(node.callee.name)
  ) {
    return initializerFailure(
      ShaderDiagnosticCode.UnsupportedCall,
      "Module constant initializers allow only directly imported vec2, vec3, or vec4 constructors.",
      rangeOf(node),
    );
  }
  const name = node.callee.name as "vec2" | "vec3" | "vec4";
  if (node.typeArguments || node.arguments.length === 0) {
    return initializerFailure(
      ShaderDiagnosticCode.InvalidConstructor,
      `No matching ${JSON.stringify(name)} module constant constructor.`,
      rangeOf(node),
    );
  }

  const arguments_: ModuleConstantInitializer[] = [];
  for (const argument of node.arguments) {
    if (
      argument.type === "SpreadElement" ||
      argument.type === "ArgumentPlaceholder"
    ) {
      return initializerFailure(
        ShaderDiagnosticCode.UnsupportedCall,
        "Module constant constructors do not support spread or placeholder arguments.",
        rangeOf(argument),
      );
    }
    const parsed = parseInitializer(argument, definition, context);
    if (!parsed.ok) return parsed;
    arguments_.push(parsed.initializer);
  }

  const type = constructorType(name, arguments_);
  if (!type) {
    return initializerFailure(
      ShaderDiagnosticCode.InvalidConstructor,
      `No matching ${JSON.stringify(name)} module constant constructor for the supplied scalar/vector shapes.`,
      rangeOf(node),
    );
  }
  return {
    ok: true,
    initializer: {
      kind: "constructor",
      name,
      arguments: arguments_,
      type,
      range: rangeOf(node),
    },
  };
}

function constructorType(
  name: "vec2" | "vec3" | "vec4",
  arguments_: readonly ModuleConstantInitializer[],
): ModuleConstantType | undefined {
  const size = Number(name.slice(-1)) as 2 | 3 | 4;
  if (arguments_.length === 1) {
    const argument = arguments_[0]!;
    if (
      argument.type.kind === "scalar" ||
      (argument.type.kind === "vector" && argument.type.size === size)
    )
      return vectorType(size);
    return undefined;
  }
  if (
    arguments_.length === size &&
    arguments_.every((argument) => argument.type.kind === "scalar")
  )
    return vectorType(size);
  if (
    arguments_.length === 2 &&
    (name === "vec3" || name === "vec4") &&
    arguments_[0]!.type.kind === "vector" &&
    arguments_[0]!.type.size === size - 1 &&
    arguments_[1]!.type.kind === "scalar"
  )
    return vectorType(size);
  if (
    name === "vec4" &&
    arguments_.length === 3 &&
    arguments_[0]!.type.kind === "vector" &&
    arguments_[0]!.type.size === 2 &&
    arguments_[1]!.type.kind === "scalar" &&
    arguments_[2]!.type.kind === "scalar"
  )
    return vectorType(4);
  return undefined;
}

function collectDefinitions(
  file: File,
): ReadonlyMap<string, readonly TopLevelConstant[]> {
  const definitions = new Map<string, TopLevelConstant[]>();
  for (const statement of file.program.body) {
    const declaration = unwrapVariableDeclaration(statement);
    if (!declaration || declaration.kind !== "const") continue;
    for (const item of declaration.declarations) {
      if (item.id.type !== "Identifier" || isMarkerDeclaration(item)) continue;
      const constant: TopLevelConstant = {
        name: item.id.name,
        nameRange: rangeOf(item.id),
        declarationRange: rangeOf(declaration),
        declaration: item,
        simpleDeclaration:
          declaration.declarations.length === 1 && !item.id.typeAnnotation,
        sourceStart: item.start ?? 0,
      };
      const existing = definitions.get(constant.name) ?? [];
      existing.push(constant);
      definitions.set(constant.name, existing);
    }
  }
  return definitions;
}

function isMarkerDeclaration(item: VariableDeclarator): boolean {
  return (
    item.init?.type === "CallExpression" &&
    item.init.callee.type === "Identifier" &&
    (item.init.callee.name === "defineShaderFunction" ||
      item.init.callee.name === "defineUniforms")
  );
}

function collectBindings(
  file: File,
  options: ParseModuleConstantsOptions,
): ParsedBindings {
  const constructorNames = new Set(options.constructorNames ?? []);
  const conflictingNames = new Set(options.conflictingNames ?? []);
  for (const name of SHADER_CONTEXT_NAMES) conflictingNames.add(name);

  for (const statement of file.program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    collectImportBindings(statement, constructorNames, conflictingNames);
  }

  for (const statement of file.program.body) {
    const declaration = unwrapVariableDeclaration(statement);
    const item = declaration?.declarations[0];
    if (
      item?.id.type === "Identifier" &&
      item.init?.type === "CallExpression" &&
      item.init.callee.type === "Identifier" &&
      (item.init.callee.name === "defineShaderFunction" ||
        item.init.callee.name === "defineUniforms")
    ) {
      conflictingNames.add(item.id.name);
    }
  }

  return { constructorNames, conflictingNames };
}

function collectImportBindings(
  statement: ImportDeclaration,
  constructorNames: Set<string>,
  conflictingNames: Set<string>,
): void {
  for (const specifier of statement.specifiers) {
    if (specifier.type !== "ImportSpecifier") continue;
    if (statement.importKind === "type" || specifier.importKind === "type")
      continue;
    const imported =
      specifier.imported.type === "Identifier"
        ? specifier.imported.name
        : specifier.imported.value;
    const local = specifier.local.name;
    conflictingNames.add(local);
    if (
      statement.source.value === "shdr" &&
      local === imported &&
      CONSTRUCTOR_NAMES.has(imported)
    ) {
      constructorNames.add(local);
    }
  }
}

function unwrapVariableDeclaration(
  statement: File["program"]["body"][number],
): VariableDeclaration | undefined {
  return statement.type === "ExportNamedDeclaration"
    ? statement.declaration?.type === "VariableDeclaration"
      ? statement.declaration
      : undefined
    : statement.type === "VariableDeclaration"
      ? statement
      : undefined;
}

function parseSource(
  source: string,
): { readonly ok: true; readonly file: File } | ParseModuleConstantsFailure {
  try {
    const file = parse(source, {
      createParenthesizedExpressions: true,
      errorRecovery: true,
      plugins: ["typescript"],
      ranges: true,
      sourceType: "module",
    });
    if (file.errors.length) {
      return {
        ok: false,
        diagnostics: file.errors.map(
          (error) =>
            failure(ShaderDiagnosticCode.TypeScriptSyntax, error.message, {
              start: error.pos,
              length: error.pos < source.length ? 1 : 0,
            }).diagnostics[0]!,
        ),
      };
    }
    return { ok: true, file };
  } catch (error) {
    const parseError = error as Partial<ParseError>;
    const start = typeof parseError.pos === "number" ? parseError.pos : 0;
    return failure(
      ShaderDiagnosticCode.TypeScriptSyntax,
      error instanceof Error
        ? error.message
        : "Unable to parse TypeScript source.",
      { start, length: start < source.length ? 1 : 0 },
    );
  }
}

function scalarType(): ModuleConstantType {
  return { kind: "scalar", scalar: "f32" };
}

function vectorType(size: 2 | 3 | 4): ModuleConstantType {
  return { kind: "vector", scalar: "f32", size };
}

function initializerFailure(
  code: ShaderDiagnosticCode,
  message: string,
  range: TextRange,
): InitializerFailure {
  return { ok: false, diagnostic: { code, message, range, severity: "error" } };
}

function failure(
  code: ShaderDiagnosticCode,
  message: string,
  range: TextRange,
): ParseModuleConstantsFailure {
  return {
    ok: false,
    diagnostics: [{ code, message, range, severity: "error" }],
  };
}

function rangeOf(node: Node): TextRange {
  const start = node.start ?? 0;
  return { start, length: (node.end ?? start) - start };
}
