import {
  analyzeFragment,
  checkShaderGraph,
  isShaderBuiltinName,
  ShaderDiagnosticCode,
  type ShaderDiagnostic,
  type ShaderExpressionSyntax,
  type TextRange,
} from "@shdr/core";
import { loadShaderGraphSync, ProjectInputError } from "@shdr/project";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  routeShaderDiagnostics,
  type RoutedDiagnostic,
} from "./diagnostic-routing.js";
import {
  TypeScript7CheckerAdapter,
  type CheckedTypeScriptSource,
  type CheckedVirtualSource,
  type TypeScript7CheckerOptions,
  type TypeScriptQuickInfo,
} from "./typescript-7-checker.js";

export type EditorDocumentVersion = string | number;

export interface TypeScript7EditorDocumentInput {
  readonly fileName: string;
  readonly source: string;
  readonly version: EditorDocumentVersion;
  readonly projectVersion: EditorDocumentVersion;
}

export interface TypeScript7EditorDocument {
  readonly fileName: string;
  readonly source: string;
  readonly version: EditorDocumentVersion;
  readonly projectVersion: EditorDocumentVersion;
  readonly isShader: boolean;
  /** True when the standard TypeScript editor provider should handle the file. */
  readonly delegated: boolean;
  readonly diagnostics: readonly RoutedDiagnostic[];

  getQuickInfoAtPosition(position: number): TypeScriptQuickInfo | undefined;
}

/**
 * Project-aware editor facade over core transformation, TypeScript 7 checking,
 * diagnostic routing, QuickInfo mapping, and source-version caching.
 */
export class TypeScript7EditorAdapter {
  readonly #cwd: string;
  readonly #options: TypeScript7CheckerOptions;
  #checker: TypeScript7CheckerAdapter;
  readonly #documents = new Map<string, TypeScript7EditorDocumentImpl>();
  #projectVersion: EditorDocumentVersion | undefined;
  #disposed = false;

  public constructor(options: TypeScript7CheckerOptions) {
    this.#cwd = resolve(options.cwd ?? process.cwd());
    this.#options = { ...options, cwd: this.#cwd };
    this.#checker = new TypeScript7CheckerAdapter(this.#options);
  }

  public updateDocument(
    input: TypeScript7EditorDocumentInput,
  ): TypeScript7EditorDocument {
    this.#assertOpen();
    this.#updateProjectVersion(input.projectVersion);

    const fileName = resolve(this.#cwd, input.fileName);
    const cached = this.#documents.get(fileName);
    if (
      cached &&
      cached.version === input.version &&
      cached.projectVersion === input.projectVersion &&
      cached.source === input.source
    ) {
      return cached;
    }

    cached?.dispose();
    // TypeScript 7 can retain the old type graph of an open file after a
    // changed-only snapshot, especially for an unused shader local. Reopen
    // between authored document versions. Fragment-only original/virtual pairs
    // can share a session; helper inference additionally reopens before virtual checking.
    if (cached && cached.source !== input.source)
      this.#checker.closeFile(fileName);
    if (!fileName.endsWith(".shdr.ts")) {
      const delegated = new TypeScript7EditorDocumentImpl({
        fileName,
        source: input.source,
        version: input.version,
        projectVersion: input.projectVersion,
        isShader: false,
        delegated: true,
        diagnostics: [],
      });
      this.#documents.set(fileName, delegated);
      return delegated;
    }

    const original = this.#checker.checkSource(fileName, input.source);
    try {
      const document = this.#createShaderDocument(
        input,
        fileName,
        original,
        this.#graphDiagnostics(fileName, input.source),
      );
      this.#documents.set(fileName, document);
      return document;
    } catch (error) {
      original.dispose();
      throw error;
    }
  }

  public closeDocument(fileName: string): void {
    const resolvedFileName = resolve(this.#cwd, fileName);
    this.#documents.get(resolvedFileName)?.dispose();
    this.#documents.delete(resolvedFileName);
    this.#checker.closeFile(resolvedFileName);
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const document of this.#documents.values()) document.dispose();
    this.#documents.clear();
    this.#checker.dispose();
  }

  #updateProjectVersion(projectVersion: EditorDocumentVersion): void {
    if (this.#projectVersion === undefined) {
      this.#projectVersion = projectVersion;
      return;
    }
    if (this.#projectVersion === projectVersion) return;

    for (const document of this.#documents.values()) document.dispose();
    this.#documents.clear();
    this.#checker.dispose();
    this.#checker = new TypeScript7CheckerAdapter(this.#options);
    this.#projectVersion = projectVersion;
  }

  #graphDiagnostics(
    fileName: string,
    source: string,
  ): readonly ShaderDiagnostic[] {
    try {
      const entry = resolve(this.#cwd, fileName);
      const loaded = loadShaderGraphSync({
        entry,
        searchRoots: [this.#cwd],
        readSource: (candidate) => {
          const resolvedCandidate = resolve(this.#cwd, candidate);
          if (resolvedCandidate === entry) return source;
          return (
            this.#documents.get(resolvedCandidate)?.source ??
            readFileSync(resolvedCandidate, "utf8")
          );
        },
      });
      const fileCount =
        loaded.input.files instanceof Map
          ? loaded.input.files.size
          : Object.keys(loaded.input.files).length;
      if (fileCount < 2 && !isHelperOnlySource(source)) {
        return [];
      }
      const checked = checkShaderGraph(loaded.input);
      if (checked.ok) return [];
      return checked.diagnostics
        .filter((diagnostic) => diagnostic.fileName === entry)
        .map(({ fileName: _fileName, ...diagnostic }) => diagnostic);
    } catch (error) {
      if (!(error instanceof ProjectInputError)) throw error;
      return [];
    }
  }

  #createShaderDocument(
    input: TypeScript7EditorDocumentInput,
    fileName: string,
    original: CheckedTypeScriptSource,
    graphDiagnostics: readonly ShaderDiagnostic[],
  ): TypeScript7EditorDocumentImpl {
    const analysis = analyzeFragment(input.source, fileName);
    const helperOnly = isHelperOnlySource(input.source);
    const transformed = analysis.virtual;
    if (!transformed.ok) {
      const diagnostics = helperOnly
        ? transformed.diagnostics.filter(
            (diagnostic) =>
              diagnostic.code !==
                ShaderDiagnosticCode.MissingCreateFragmentShaderImport &&
              diagnostic.code !== ShaderDiagnosticCode.MissingDefaultExport,
          )
        : transformed.diagnostics;
      return new TypeScript7EditorDocumentImpl({
        fileName,
        source: input.source,
        version: input.version,
        projectVersion: input.projectVersion,
        isShader: true,
        delegated: false,
        diagnostics: mergeRoutedDiagnostics(
          routeShaderDiagnostics({
            shaderRegion: helperOnly ? undefined : transformed.shaderRegion,
            shaderRegions: helperOnly
              ? (transformed.shaderRegions ?? [])
              : transformed.shaderRegions,
            originalSyntacticDiagnostics: original.syntacticDiagnostics,
            originalSemanticDiagnostics: original.semanticDiagnostics,
            coreDiagnostics: diagnostics,
          }),
          graphDiagnostics,
        ),
        shaderRegion: helperOnly ? undefined : transformed.shaderRegion,
        shaderRegions: helperOnly ? [] : transformed.shaderRegions,
        original,
        useOriginalForShader: helperOnly,
      });
    }

    const lowered = analysis.lowered;
    const parsedInfo = !lowered.ok ? analysis.parsed.info : undefined;
    const hasLocalHelpers = !!(
      analysis.parsed.info?.functions?.length ||
      analysis.parsed.helperFunctions?.length
    );
    const helperFailure = hasLocalHelpers && !lowered.ok && !helperOnly;
    const definitionFailure =
      helperFailure &&
      parsedInfo?.functions?.some((helper) =>
        lowered.diagnostics.some((diagnostic) =>
          containsPosition(helper.range, diagnostic.range.start),
        ),
      );
    // Core validates all helpers and calls, stopping at the first error. A bad
    // definition can poison inferred types throughout the call graph; report
    // that authored fault, not TypeScript's downstream overload/any cascades.
    // Ordinary TypeScript between shader regions remains checked separately.
    // When no expression needed rewriting, reuse the original TS snapshot.
    // Updating the same file with identical virtual text can otherwise leave
    // TypeScript 7 QuickInfo stale after a transformed previous version.
    const unchanged = transformed.virtualSource.code === input.source;
    // A helper's invalid native arithmetic return can leave the marker's generic
    // Result cached as Expr<ShaderType>. Reopen before checking its transformed
    // body; retained original/virtual snapshots still own their respective ranges.
    if (hasLocalHelpers && !unchanged) this.#checker.closeFile(fileName);
    const virtual = unchanged
      ? undefined
      : this.#checker.checkVirtualSource(fileName, transformed.virtualSource);
    const coreDiagnostics = lowered.ok
      ? []
      : helperOnly
        ? lowered.diagnostics.filter(
            (diagnostic) =>
              diagnostic.code !==
                ShaderDiagnosticCode.MissingCreateFragmentShaderImport &&
              diagnostic.code !== ShaderDiagnosticCode.MissingDefaultExport,
          )
        : hasLocalHelpers
          ? lowered.diagnostics
          : lowered.diagnostics.filter(
              (diagnostic) =>
                diagnostic.code === ShaderDiagnosticCode.InvalidBuiltin ||
                diagnostic.code === ShaderDiagnosticCode.InvalidBuiltinDomain ||
                diagnostic.code ===
                  ShaderDiagnosticCode.InvalidNumericLiteral ||
                (diagnostic.code === ShaderDiagnosticCode.DuplicateLocal &&
                  parsedInfo !== undefined &&
                  parsedInfo.callback.syntax.declarations.some(
                    (declaration) =>
                      declaration.nameRange.start === diagnostic.range.start &&
                      declaration.nameRange.length ===
                        diagnostic.range.length &&
                      parsedInfo.shaderCallableImports.some(
                        (entry) => entry.localName === declaration.name,
                      ),
                  )) ||
                (parsedInfo !== undefined &&
                  [
                    ...parsedInfo.callback.syntax.declarations.map(
                      (declaration) => declaration.initializer,
                    ),
                    parsedInfo.callback.syntax.returnExpression,
                  ].some((expression) =>
                    hasEnclosingBuiltinCall(expression, diagnostic.range),
                  )),
            );
    const routed = routeShaderDiagnostics({
      virtualSource: transformed.virtualSource,
      originalSyntacticDiagnostics: original.syntacticDiagnostics,
      originalSemanticDiagnostics: original.semanticDiagnostics,
      virtualSemanticDiagnostics: helperFailure
        ? []
        : (virtual?.semanticDiagnostics ?? original.semanticDiagnostics),
      shaderOperationDiagnostics: helperFailure
        ? []
        : (virtual?.shaderOperationDiagnostics ?? []),
      coreDiagnostics,
    });
    return new TypeScript7EditorDocumentImpl({
      fileName,
      source: input.source,
      version: input.version,
      projectVersion: input.projectVersion,
      isShader: true,
      delegated: false,
      diagnostics: mergeRoutedDiagnostics(routed, graphDiagnostics),
      shaderRegion: transformed.virtualSource.shaderRegion,
      shaderRegions: transformed.virtualSource.shaderRegions,
      // A failed definition can corrupt inferred helper/dependent types. A
      // fragment-only call error does not invalidate trusted helper signatures.
      disableShaderHovers: definitionFailure,
      suppressCoreErrorHovers: hasLocalHelpers,
      original,
      virtual,
      useOriginalForShader: unchanged,
    });
  }

  #assertOpen(): void {
    if (this.#disposed) {
      throw new Error("The TypeScript 7 editor adapter has been disposed.");
    }
  }
}

interface EditorDocumentState {
  readonly fileName: string;
  readonly source: string;
  readonly version: EditorDocumentVersion;
  readonly projectVersion: EditorDocumentVersion;
  readonly isShader: boolean;
  readonly delegated: boolean;
  readonly diagnostics: readonly RoutedDiagnostic[];
  readonly shaderRegion?: TextRange;
  readonly shaderRegions?: readonly TextRange[];
  readonly disableShaderHovers?: boolean;
  readonly suppressCoreErrorHovers?: boolean;
  readonly original?: CheckedTypeScriptSource;
  readonly virtual?: CheckedVirtualSource;
  readonly useOriginalForShader?: boolean;
}

class TypeScript7EditorDocumentImpl implements TypeScript7EditorDocument {
  readonly #original?: CheckedTypeScriptSource;
  readonly #virtual?: CheckedVirtualSource;
  readonly #shaderRegions: readonly TextRange[];
  readonly #disableShaderHovers: boolean;
  readonly #suppressCoreErrorHovers: boolean;
  readonly #useOriginalForShader: boolean;
  #disposed = false;

  public readonly fileName: string;
  public readonly source: string;
  public readonly version: EditorDocumentVersion;
  public readonly projectVersion: EditorDocumentVersion;
  public readonly isShader: boolean;
  public readonly delegated: boolean;
  public readonly diagnostics: readonly RoutedDiagnostic[];

  public constructor(state: EditorDocumentState) {
    this.fileName = state.fileName;
    this.source = state.source;
    this.version = state.version;
    this.projectVersion = state.projectVersion;
    this.isShader = state.isShader;
    this.delegated = state.delegated;
    this.diagnostics = state.diagnostics;
    this.#shaderRegions =
      state.shaderRegions ?? (state.shaderRegion ? [state.shaderRegion] : []);
    this.#disableShaderHovers = state.disableShaderHovers ?? false;
    this.#suppressCoreErrorHovers = state.suppressCoreErrorHovers ?? false;
    this.#original = state.original;
    this.#virtual = state.virtual;
    this.#useOriginalForShader = state.useOriginalForShader ?? false;
  }

  public getQuickInfoAtPosition(
    position: number,
  ): TypeScriptQuickInfo | undefined {
    if (this.#disposed) return undefined;
    const inShader = this.#shaderRegions.some((region) =>
      containsPosition(region, position),
    );
    if (this.#disableShaderHovers && inShader) return undefined;
    if (
      this.diagnostics.some(
        (diagnostic) =>
          diagnostic.source === "shdr" &&
          (this.#suppressCoreErrorHovers ||
            diagnostic.code === ShaderDiagnosticCode.InvalidBuiltin ||
            diagnostic.code === ShaderDiagnosticCode.InvalidBuiltinDomain) &&
          containsPosition(diagnostic.range, position),
      )
    ) {
      return undefined;
    }
    if (this.#virtual) {
      return this.#virtual.getQuickInfoAtOriginalPosition(position);
    }
    if (!this.#useOriginalForShader && inShader) {
      return undefined;
    }
    return this.#original?.getQuickInfoAtPosition(position);
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#virtual?.dispose();
    this.#original?.dispose();
  }
}

function mergeRoutedDiagnostics(
  local: readonly RoutedDiagnostic[],
  graph: readonly ShaderDiagnostic[],
): readonly RoutedDiagnostic[] {
  return [
    ...local,
    ...graph
      .filter(
        (diagnostic) =>
          !local.some(
            (existing) =>
              existing.source === "shdr" &&
              rangesOverlap(existing.range, diagnostic.range),
          ),
      )
      .map((diagnostic) => ({
        ...diagnostic,
        category: "error" as const,
        source: "shdr" as const,
      })),
  ];
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  if (left.length === 0) return containsPosition(right, left.start);
  if (right.length === 0) return containsPosition(left, right.start);
  return (
    left.start < right.start + right.length &&
    right.start < left.start + left.length
  );
}

function isHelperOnlySource(source: string): boolean {
  return (
    !/\bexport\s+default\b/.test(source) &&
    /\b(?:defineShaderFunction|defineUniforms)\b/.test(source)
  );
}

function hasEnclosingBuiltinCall(
  expression: ShaderExpressionSyntax,
  range: TextRange,
): boolean {
  if (
    expression.kind === "call-expression" &&
    isShaderBuiltinName(expression.calleeName) &&
    range.start >= expression.range.start &&
    range.start + range.length <=
      expression.range.start + expression.range.length
  ) {
    return true;
  }
  switch (expression.kind) {
    case "call-expression":
      return expression.arguments.some((argument) =>
        hasEnclosingBuiltinCall(argument, range),
      );
    case "parenthesized-expression":
      return hasEnclosingBuiltinCall(expression.expression, range);
    case "unary-expression":
      return hasEnclosingBuiltinCall(expression.argument, range);
    case "binary-expression":
      return (
        hasEnclosingBuiltinCall(expression.left, range) ||
        hasEnclosingBuiltinCall(expression.right, range)
      );
    case "property-access":
      return hasEnclosingBuiltinCall(expression.object, range);
    case "numeric-literal":
    case "identifier":
      return false;
    default:
      return assertNever(expression);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected shader syntax: ${JSON.stringify(value)}`);
}

function containsPosition(range: TextRange, position: number): boolean {
  return position >= range.start && position < range.start + range.length;
}
