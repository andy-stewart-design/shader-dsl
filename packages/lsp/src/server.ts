import { TypeScript7EditorAdapter } from "@shdr/language-service";
import { fileURLToPath } from "node:url";
import type { Readable, Writable } from "node:stream";
import {
  createConnection,
  DiagnosticSeverity,
  MarkupKind,
  TextDocumentSyncKind,
  type InitializeParams,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

/** One workspace/tsconfig, with no Zed- or VS Code-specific semantics. */
export function startShdrLsp(input: Readable, output: Writable): void {
  const connection = createConnection(input, output);
  const documents = new Map<string, TextDocument>();
  let adapter: TypeScript7EditorAdapter | undefined;

  connection.onInitialize((params) => {
    adapter = new TypeScript7EditorAdapter({
      cwd: workspacePath(params),
      projectFileName: "tsconfig.json",
    });
    return {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Incremental,
        },
        hoverProvider: true,
      },
    };
  });

  const publish = (uri: string, document: TextDocument): void => {
    if (!adapter) return;
    const checked = adapter.updateDocument({
      fileName: fileURLToPath(uri),
      source: document.getText(),
      version: document.version,
      projectVersion: 1,
    });
    connection.sendDiagnostics({
      uri,
      version: document.version,
      diagnostics: checked.diagnostics.map((diagnostic) => ({
        range: {
          start: document.positionAt(diagnostic.range.start),
          end: document.positionAt(
            diagnostic.range.start + diagnostic.range.length,
          ),
        },
        message: diagnostic.message,
        code: diagnostic.code,
        source: diagnostic.source === "typescript" ? "ts" : "shdr",
        severity: {
          error: DiagnosticSeverity.Error,
          warning: DiagnosticSeverity.Warning,
          suggestion: DiagnosticSeverity.Hint,
          message: DiagnosticSeverity.Information,
        }[diagnostic.category],
      })),
    });
  };

  connection.onDidOpenTextDocument(({ textDocument }) => {
    if (!isShaderFile(textDocument.uri) || !adapter) return;
    const document = TextDocument.create(
      textDocument.uri,
      textDocument.languageId,
      textDocument.version,
      textDocument.text,
    );
    documents.set(document.uri, document);
    publish(document.uri, document);
  });

  connection.onDidChangeTextDocument(({ textDocument, contentChanges }) => {
    const previous = documents.get(textDocument.uri);
    if (
      !previous ||
      textDocument.version <= previous.version ||
      contentChanges.length === 0
    ) {
      return;
    }
    const document = TextDocument.update(
      previous,
      contentChanges,
      textDocument.version,
    );
    documents.set(document.uri, document);
    publish(document.uri, document);
  });

  connection.onDidCloseTextDocument(({ textDocument }) => {
    if (!documents.delete(textDocument.uri)) return;
    adapter?.closeDocument(fileURLToPath(textDocument.uri));
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
  });

  connection.onHover(({ textDocument, position }, token) => {
    if (token.isCancellationRequested) return null;
    const document = documents.get(textDocument.uri);
    if (!document || !adapter) return null;
    const checked = adapter.updateDocument({
      fileName: fileURLToPath(document.uri),
      source: document.getText(),
      version: document.version,
      projectVersion: 1,
    });
    const info = checked.getQuickInfoAtPosition(document.offsetAt(position));
    if (!info) return null;
    return {
      contents: { kind: MarkupKind.PlainText, value: info.display },
      range: {
        start: document.positionAt(info.range.start),
        end: document.positionAt(info.range.start + info.range.length),
      },
    };
  });

  connection.onShutdown(() => {
    adapter?.dispose();
    adapter = undefined;
    documents.clear();
  });
  connection.onExit(() => adapter?.dispose());
  connection.listen();
}

function isShaderFile(uri: string): boolean {
  return uri.startsWith("file:") && fileURLToPath(uri).endsWith(".shdr.ts");
}

function workspacePath(params: InitializeParams): string {
  const uri = params.workspaceFolders?.[0]?.uri ?? params.rootUri;
  if (uri?.startsWith("file:")) return fileURLToPath(uri);
  return params.rootPath ?? process.cwd();
}
