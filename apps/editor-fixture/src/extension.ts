import {
  createVirtualSource,
  mapGeneratedRangeToOriginal,
  mapOriginalOffsetToGenerated,
  type CreateVirtualSourceSuccess,
  type ShaderDiagnostic,
} from "@shdr/core";
import {
  API,
  type Diagnostic as TypeScriptDiagnostic,
} from "typescript/unstable/sync";
import * as vscode from "vscode";

interface DocumentState {
  readonly source: string;
  readonly virtual: CreateVirtualSourceSuccess;
}

const SHADER_LANGUAGE_ID = "shdr-typescript";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const diagnostics = vscode.languages.createDiagnosticCollection("shdr");
  const states = new Map<string, DocumentState>();
  const workspaceDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceDirectory) return;

  const api = new API({
    cwd: workspaceDirectory,
    fs: {
      readFile(fileName) {
        return states.get(vscode.Uri.file(fileName).toString())?.virtual
          .virtualSource.code;
      },
    },
  });
  let snapshot: ReturnType<typeof api.updateSnapshot> | undefined;
  let openedProject = false;

  const updateDocument = (document: vscode.TextDocument): void => {
    if (document.languageId !== SHADER_LANGUAGE_ID) return;

    const uri = document.uri.toString();
    const source = document.getText();
    const virtual = createVirtualSource(source, document.uri.fsPath);
    if (!virtual.ok) {
      states.delete(uri);
      diagnostics.set(
        document.uri,
        virtual.diagnostics.map((diagnostic) =>
          fromShaderDiagnostic(document, diagnostic),
        ),
      );
      return;
    }

    states.set(uri, { source, virtual });
    const previousSnapshot = snapshot;
    snapshot = api.updateSnapshot({
      openProjects: openedProject
        ? undefined
        : [
            vscode.Uri.joinPath(
              vscode.workspace.getWorkspaceFolder(document.uri)!.uri,
              "tsconfig.json",
            ).fsPath,
          ],
      openFiles: [document.uri.fsPath],
      fileChanges: { changed: [document.uri.fsPath] },
    });
    openedProject = true;
    previousSnapshot?.dispose();

    const project = snapshot.getDefaultProjectForFile(document.uri.fsPath);
    if (!project) {
      diagnostics.set(document.uri, []);
      return;
    }

    const typeScriptDiagnostics = [
      ...project.program.getSyntacticDiagnostics(document.uri.fsPath),
      ...project.program.getSemanticDiagnostics(document.uri.fsPath),
    ];
    diagnostics.set(
      document.uri,
      typeScriptDiagnostics.flatMap((diagnostic) => {
        const converted = fromTypeScriptDiagnostic(
          document,
          virtual,
          diagnostic,
        );
        return converted ? [converted] : [];
      }),
    );
  };

  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(updateDocument),
    vscode.workspace.onDidChangeTextDocument((event) =>
      updateDocument(event.document),
    ),
    vscode.workspace.onDidCloseTextDocument((document) => {
      states.delete(document.uri.toString());
      diagnostics.delete(document.uri);
    }),
    vscode.languages.registerHoverProvider(SHADER_LANGUAGE_ID, {
      provideHover(document, position) {
        const state = states.get(document.uri.toString());
        if (!state || !snapshot) return undefined;

        const originalOffset = document.offsetAt(position);
        const generatedOffset = mapOriginalOffsetToGenerated(
          state.virtual.virtualSource,
          originalOffset,
        );
        if (generatedOffset === undefined) return undefined;

        const project = snapshot.getDefaultProjectForFile(document.uri.fsPath);
        const type = project?.checker.getTypeAtPosition(
          document.uri.fsPath,
          generatedOffset,
        );
        if (!project || !type) return undefined;

        const display = project.checker.typeToString(type);
        const contents = new vscode.MarkdownString();
        contents.appendCodeblock(display, "typescript");
        return new vscode.Hover(
          contents,
          document.getWordRangeAtPosition(position),
        );
      },
    }),
    {
      dispose() {
        snapshot?.dispose();
        api.close();
      },
    },
  );

  for (const document of vscode.workspace.textDocuments) {
    updateDocument(document);
  }
}

export function deactivate(): void {}

function fromShaderDiagnostic(
  document: vscode.TextDocument,
  diagnostic: ShaderDiagnostic,
): vscode.Diagnostic {
  const result = new vscode.Diagnostic(
    toDocumentRange(document, diagnostic.range),
    diagnostic.message,
    vscode.DiagnosticSeverity.Error,
  );
  result.code = diagnostic.code;
  result.source = "shdr";
  return result;
}

function fromTypeScriptDiagnostic(
  document: vscode.TextDocument,
  virtual: CreateVirtualSourceSuccess,
  diagnostic: TypeScriptDiagnostic,
): vscode.Diagnostic | undefined {
  const original = mapGeneratedRangeToOriginal(virtual.virtualSource, {
    start: diagnostic.pos,
    length: diagnostic.end - diagnostic.pos,
  });
  if (!original) return undefined;

  const result = new vscode.Diagnostic(
    toDocumentRange(document, original),
    diagnostic.text,
    diagnostic.category === 1
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning,
  );
  result.code = diagnostic.code;
  result.source = "ts";
  return result;
}

function toDocumentRange(
  document: vscode.TextDocument,
  range: { readonly start: number; readonly length: number },
): vscode.Range {
  return new vscode.Range(
    document.positionAt(range.start),
    document.positionAt(range.start + range.length),
  );
}
