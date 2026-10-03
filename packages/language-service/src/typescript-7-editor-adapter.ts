import {
  createVirtualSource,
  lowerFragment,
  isShaderBuiltinName,
  parseShaderFile,
  ShaderDiagnosticCode,
  type ShaderExpressionSyntax,
  type TextRange,
} from "@shdr/core";
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
      const document = this.#createShaderDocument(input, fileName, original);
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

  #createShaderDocument(
    input: TypeScript7EditorDocumentInput,
    fileName: string,
    original: CheckedTypeScriptSource,
  ): TypeScript7EditorDocumentImpl {
    const transformed = createVirtualSource(input.source, fileName);
    if (!transformed.ok) {
      return new TypeScript7EditorDocumentImpl({
        fileName,
        source: input.source,
        version: input.version,
        projectVersion: input.projectVersion,
        isShader: true,
        delegated: false,
        diagnostics: routeShaderDiagnostics({
          shaderRegion: transformed.shaderRegion,
          originalSyntacticDiagnostics: original.syntacticDiagnostics,
          originalSemanticDiagnostics: original.semanticDiagnostics,
          coreDiagnostics: transformed.diagnostics,
        }),
        shaderRegion: transformed.shaderRegion,
        original,
      });
    }

    const lowered = lowerFragment(input.source);
    const parsedInfo = !lowered.ok
      ? parseShaderFile(input.source, fileName).info
      : undefined;
    // When no expression needed rewriting, reuse the original TS snapshot.
    // Updating the same file with identical virtual text can otherwise leave
    // TypeScript 7 QuickInfo stale after a transformed previous version.
    const unchanged = transformed.virtualSource.code === input.source;
    const virtual = unchanged
      ? undefined
      : this.#checker.checkVirtualSource(fileName, transformed.virtualSource);
    return new TypeScript7EditorDocumentImpl({
      fileName,
      source: input.source,
      version: input.version,
      projectVersion: input.projectVersion,
      isShader: true,
      delegated: false,
      diagnostics: routeShaderDiagnostics({
        virtualSource: transformed.virtualSource,
        originalSyntacticDiagnostics: original.syntacticDiagnostics,
        originalSemanticDiagnostics: original.semanticDiagnostics,
        virtualSemanticDiagnostics:
          virtual?.semanticDiagnostics ?? original.semanticDiagnostics,
        shaderOperationDiagnostics: virtual?.shaderOperationDiagnostics ?? [],
        coreDiagnostics: lowered.ok
          ? []
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
            ),
      }),
      shaderRegion: transformed.virtualSource.shaderRegion,
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
  readonly original?: CheckedTypeScriptSource;
  readonly virtual?: CheckedVirtualSource;
  readonly useOriginalForShader?: boolean;
}

class TypeScript7EditorDocumentImpl implements TypeScript7EditorDocument {
  readonly #original?: CheckedTypeScriptSource;
  readonly #virtual?: CheckedVirtualSource;
  readonly #shaderRegion?: TextRange;
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
    this.#shaderRegion = state.shaderRegion;
    this.#original = state.original;
    this.#virtual = state.virtual;
    this.#useOriginalForShader = state.useOriginalForShader ?? false;
  }

  public getQuickInfoAtPosition(
    position: number,
  ): TypeScriptQuickInfo | undefined {
    if (this.#disposed) return undefined;
    if (
      this.diagnostics.some(
        (diagnostic) =>
          diagnostic.source === "shdr" &&
          (diagnostic.code === ShaderDiagnosticCode.InvalidBuiltin ||
            diagnostic.code === ShaderDiagnosticCode.InvalidBuiltinDomain) &&
          containsPosition(diagnostic.range, position),
      )
    ) {
      return undefined;
    }
    if (this.#virtual) {
      return this.#virtual.getQuickInfoAtOriginalPosition(position);
    }
    if (
      !this.#useOriginalForShader &&
      this.#shaderRegion &&
      containsPosition(this.#shaderRegion, position)
    ) {
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
