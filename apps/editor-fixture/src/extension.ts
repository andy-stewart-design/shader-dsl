import {
  TypeScript7EditorAdapter,
  type RoutedDiagnostic,
  type TypeScript7EditorDocument,
  type TypeScriptDiagnosticCategory,
} from "@shdr/language-service";
import * as vscode from "vscode";

const SHADER_LANGUAGE_ID = "shdr-typescript";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const diagnostics = vscode.languages.createDiagnosticCollection("shdr");
  const documents = new Map<string, TypeScript7EditorDocument>();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const adapter = new TypeScript7EditorAdapter({
    cwd: workspaceFolder.uri.fsPath,
    projectFileName: "tsconfig.json",
  });
  let projectVersion = 1;

  const updateDocument = (document: vscode.TextDocument): void => {
    if (document.languageId !== SHADER_LANGUAGE_ID) return;

    const checked = adapter.updateDocument({
      fileName: document.uri.fsPath,
      source: document.getText(),
      version: document.version,
      projectVersion,
    });
    documents.set(document.uri.toString(), checked);
    diagnostics.set(
      document.uri,
      checked.diagnostics.map((diagnostic) =>
        toVsCodeDiagnostic(document, diagnostic),
      ),
    );
  };

  const updateOpenShaderDocuments = (): void => {
    const openDocuments = [...vscode.workspace.textDocuments].sort(
      (left, right) =>
        Number(isShaderDependencySource(right.getText())) -
        Number(isShaderDependencySource(left.getText())),
    );
    for (const document of openDocuments) updateDocument(document);
  };

  const updateAfterShaderEdit = (document: vscode.TextDocument): void => {
    const previous = documents.get(document.uri.toString())?.source ?? "";
    const dependencyChanged =
      isShaderDependencySource(previous) ||
      isShaderDependencySource(document.getText());
    if (dependencyChanged) projectVersion += 1;
    // Check the edited dependency first so callers see its new virtual
    // TypeScript snapshot when they are refreshed below.
    if (dependencyChanged) updateDocument(document);
    for (const open of vscode.workspace.textDocuments) {
      if (open !== document) updateDocument(open);
    }
    if (!dependencyChanged) updateDocument(document);
  };

  const configWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceFolder, "tsconfig.json"),
  );
  const updateProject = (): void => {
    projectVersion += 1;
    updateOpenShaderDocuments();
  };

  context.subscriptions.push(
    diagnostics,
    configWatcher,
    configWatcher.onDidChange(updateProject),
    configWatcher.onDidCreate(updateProject),
    configWatcher.onDidDelete(updateProject),
    vscode.workspace.onDidOpenTextDocument(updateDocument),
    vscode.workspace.onDidChangeTextDocument((event) =>
      updateAfterShaderEdit(event.document),
    ),
    vscode.workspace.onDidCloseTextDocument((document) => {
      documents.delete(document.uri.toString());
      diagnostics.delete(document.uri);
      adapter.closeDocument(document.uri.fsPath);
    }),
    vscode.languages.registerHoverProvider(SHADER_LANGUAGE_ID, {
      provideHover(document, position) {
        const checked = documents.get(document.uri.toString());
        const quickInfo = checked?.getQuickInfoAtPosition(
          document.offsetAt(position),
        );
        if (!quickInfo) return undefined;

        const contents = new vscode.MarkdownString();
        contents.appendCodeblock(quickInfo.display, "typescript");
        return new vscode.Hover(
          contents,
          toVsCodeRange(document, quickInfo.range),
        );
      },
    }),
    { dispose: () => adapter.dispose() },
  );

  updateOpenShaderDocuments();
}

export function deactivate(): void {}

function isShaderDependencySource(source: string): boolean {
  return /\b(?:defineShaderFunction|defineUniforms)\b/.test(source);
}

function toVsCodeDiagnostic(
  document: vscode.TextDocument,
  diagnostic: RoutedDiagnostic,
): vscode.Diagnostic {
  const result = new vscode.Diagnostic(
    toVsCodeRange(document, diagnostic.range),
    diagnostic.message,
    toVsCodeSeverity(diagnostic.category),
  );
  result.code = diagnostic.code;
  result.source = diagnostic.source === "typescript" ? "ts" : "shdr";
  return result;
}

function toVsCodeSeverity(
  category: TypeScriptDiagnosticCategory,
): vscode.DiagnosticSeverity {
  switch (category) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "suggestion":
      return vscode.DiagnosticSeverity.Hint;
    case "message":
      return vscode.DiagnosticSeverity.Information;
  }
}

function toVsCodeRange(
  document: vscode.TextDocument,
  range: { readonly start: number; readonly length: number },
): vscode.Range {
  return new vscode.Range(
    document.positionAt(range.start),
    document.positionAt(range.start + range.length),
  );
}
