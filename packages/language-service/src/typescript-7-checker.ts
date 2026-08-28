import type { TextRange, VirtualSource } from "@shdr/core";
import { resolve } from "node:path";
import type { Node, SourceFile } from "typescript/unstable/ast";
import {
  API,
  DiagnosticCategory,
  type Diagnostic as TypeScriptDiagnostic,
  type Project,
  type Snapshot,
} from "typescript/unstable/sync";

export type TypeScriptDiagnosticCategory =
  "error" | "warning" | "suggestion" | "message";

export interface TypeScriptCheckerDiagnostic {
  readonly fileName?: string;
  readonly range: TextRange;
  readonly code: number;
  readonly category: TypeScriptDiagnosticCategory;
  readonly message: string;
}

export interface TypeScriptQuickInfo {
  readonly name?: string;
  readonly display: string;
  readonly range: TextRange;
}

export interface NamedDeclarationType {
  readonly name: string;
  readonly display: string;
  readonly range: TextRange;
}

export interface TypeScript7CheckerOptions {
  readonly projectFileName: string;
  readonly cwd?: string;
}

export interface CheckedVirtualSource {
  readonly semanticDiagnostics: readonly TypeScriptCheckerDiagnostic[];

  getQuickInfoAtGeneratedPosition(
    generatedPosition: number,
  ): TypeScriptQuickInfo | undefined;

  getTypeOfNamedDeclaration(name: string): NamedDeclarationType | undefined;

  dispose(): void;
}

/**
 * Checks generated shader TypeScript in a real TypeScript 7 project. TypeScript's
 * unstable API objects remain private; callers receive only project-owned data.
 */
export class TypeScript7CheckerAdapter {
  readonly #api: API;
  readonly #cwd: string;
  readonly #projectFileName: string;
  readonly #virtualFiles = new Map<string, string>();
  readonly #openFiles = new Set<string>();
  readonly #checks = new Set<CheckedVirtualSourceImpl>();
  #projectOpened = false;
  #disposed = false;

  public constructor(options: TypeScript7CheckerOptions) {
    this.#cwd = resolve(options.cwd ?? process.cwd());
    this.#projectFileName = resolve(this.#cwd, options.projectFileName);
    this.#api = new API({
      cwd: this.#cwd,
      fs: {
        readFile: (fileName) =>
          this.#virtualFiles.get(resolve(this.#cwd, fileName)),
      },
    });
  }

  public checkVirtualSource(
    fileName: string,
    virtualSource: VirtualSource,
  ): CheckedVirtualSource {
    this.#assertOpen();

    const resolvedFileName = resolve(this.#cwd, fileName);
    this.#virtualFiles.set(resolvedFileName, virtualSource.code);

    const shouldOpenFile = !this.#openFiles.has(resolvedFileName);
    const snapshot = this.#api.updateSnapshot({
      openProjects: this.#projectOpened ? undefined : [this.#projectFileName],
      openFiles: shouldOpenFile ? [resolvedFileName] : undefined,
      fileChanges: { changed: [resolvedFileName] },
    });
    this.#projectOpened = true;
    this.#openFiles.add(resolvedFileName);

    const project = snapshot.getDefaultProjectForFile(resolvedFileName);
    if (!project) {
      snapshot.dispose();
      throw new Error(
        `TypeScript 7 did not load ${resolvedFileName} into a project.`,
      );
    }

    const check = new CheckedVirtualSourceImpl(
      resolvedFileName,
      snapshot,
      project,
      () => this.#checks.delete(check),
    );
    this.#checks.add(check);
    return check;
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const check of [...this.#checks]) check.dispose();
    this.#api.close();
    this.#virtualFiles.clear();
    this.#openFiles.clear();
  }

  #assertOpen(): void {
    if (this.#disposed) {
      throw new Error("The TypeScript 7 checker adapter has been disposed.");
    }
  }
}

class CheckedVirtualSourceImpl implements CheckedVirtualSource {
  readonly #fileName: string;
  readonly #snapshot: Snapshot;
  readonly #project: Project;
  readonly #onDispose: () => void;
  #disposed = false;

  public readonly semanticDiagnostics: readonly TypeScriptCheckerDiagnostic[];

  public constructor(
    fileName: string,
    snapshot: Snapshot,
    project: Project,
    onDispose: () => void,
  ) {
    this.#fileName = fileName;
    this.#snapshot = snapshot;
    this.#project = project;
    this.#onDispose = onDispose;
    this.semanticDiagnostics = project.program
      .getSemanticDiagnostics(fileName)
      .map(fromTypeScriptDiagnostic);
  }

  public getQuickInfoAtGeneratedPosition(
    generatedPosition: number,
  ): TypeScriptQuickInfo | undefined {
    this.#assertOpen();
    if (!Number.isInteger(generatedPosition) || generatedPosition < 0) {
      return undefined;
    }

    const sourceFile = this.#project.program.getSourceFile(this.#fileName);
    if (!sourceFile || generatedPosition >= sourceFile.text.length) {
      return undefined;
    }

    const node = findSmallestNodeAtPosition(sourceFile, generatedPosition);
    const type = this.#project.checker.getTypeAtPosition(
      this.#fileName,
      generatedPosition,
    );
    if (!node || !type) return undefined;

    return {
      name: this.#project.checker.getSymbolAtPosition(
        this.#fileName,
        generatedPosition,
      )?.name,
      display: this.#project.checker.typeToString(type),
      range: nodeRange(node, sourceFile),
    };
  }

  public getTypeOfNamedDeclaration(
    name: string,
  ): NamedDeclarationType | undefined {
    this.#assertOpen();
    if (name.length === 0) return undefined;

    const sourceFile = this.#project.program.getSourceFile(this.#fileName);
    if (!sourceFile) return undefined;

    const declaration = findNamedDeclarationIdentifier(
      sourceFile,
      this.#project,
      name,
    );
    if (!declaration) return undefined;

    const type = this.#project.checker.getTypeAtLocation(declaration);
    if (!type) return undefined;

    return {
      name,
      display: this.#project.checker.typeToString(type),
      range: nodeRange(declaration, sourceFile),
    };
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#snapshot.dispose();
    this.#onDispose();
  }

  #assertOpen(): void {
    if (this.#disposed) {
      throw new Error("The checked virtual source has been disposed.");
    }
  }
}

function fromTypeScriptDiagnostic(
  diagnostic: TypeScriptDiagnostic,
): TypeScriptCheckerDiagnostic {
  return {
    fileName: diagnostic.fileName,
    range: {
      start: diagnostic.pos,
      length: diagnostic.end - diagnostic.pos,
    },
    code: diagnostic.code,
    category: diagnosticCategory(diagnostic.category),
    message: formatDiagnosticMessage(diagnostic),
  };
}

function diagnosticCategory(
  category: DiagnosticCategory,
): TypeScriptDiagnosticCategory {
  switch (category) {
    case DiagnosticCategory.Error:
      return "error";
    case DiagnosticCategory.Suggestion:
      return "suggestion";
    case DiagnosticCategory.Message:
      return "message";
    default:
      return "warning";
  }
}

function formatDiagnosticMessage(diagnostic: TypeScriptDiagnostic): string {
  const nested = diagnostic.messageChain?.map((message) =>
    formatDiagnosticMessage(message)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
  );
  return [diagnostic.text, ...(nested ?? [])].join("\n");
}

function findSmallestNodeAtPosition(
  sourceFile: SourceFile,
  position: number,
): Node | undefined {
  const visit = (node: Node): Node | undefined => {
    const start = node.getStart(sourceFile);
    if (position < start || position >= node.getEnd()) return undefined;

    let smallest: Node = node;
    node.forEachChild((child) => {
      const candidate = visit(child);
      if (candidate) smallest = candidate;
      return undefined;
    });
    return smallest;
  };

  return visit(sourceFile);
}

function findNamedDeclarationIdentifier(
  sourceFile: SourceFile,
  project: Project,
  name: string,
): Node | undefined {
  let result: Node | undefined;

  const visit = (node: Node): void => {
    if (result) return;

    if (node.getText(sourceFile) === name) {
      const symbol = project.checker.getSymbolAtLocation(node);
      const declaration = symbol?.valueDeclaration?.resolve(project);
      if (declaration && isAncestor(declaration, node)) {
        result = node;
        return;
      }
    }

    node.forEachChild((child) => {
      visit(child);
      return undefined;
    });
  };

  visit(sourceFile);
  return result;
}

function isAncestor(ancestor: Node, node: Node): boolean {
  let current: Node | undefined = node;
  while (current) {
    if (current === ancestor) return true;
    if (current === current.parent) return false;
    current = current.parent;
  }
  return false;
}

function nodeRange(node: Node, sourceFile: SourceFile): TextRange {
  const start = node.getStart(sourceFile);
  return { start, length: node.getEnd() - start };
}
