import { TypeScript7EditorAdapter } from "@shdr/language-service";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable, Writable } from "node:stream";
import {
  createConnection,
  DiagnosticSeverity,
  DidChangeWatchedFilesNotification,
  MarkupKind,
  TextDocumentSyncKind,
  type InitializeParams,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  ProjectDiscovery,
  type ProjectSelection,
} from "./project-discovery.js";

interface OpenShader {
  document: TextDocument;
  selection: ProjectSelection;
}

interface CheckedProject {
  adapter: TypeScript7EditorAdapter;
  uris: Set<string>;
  configText: string;
}

/** Stdio LSP transport; all shader and TypeScript semantics live in the shared adapter. */
export function startShdrLsp(input: Readable, output: Writable): void {
  const connection = createConnection(input, output);
  const documents = new Map<string, OpenShader>();
  const projects = new Map<string, CheckedProject>();
  let discovery: ProjectDiscovery | undefined;
  let projectEpoch = 1;
  let registerWatchers = false;

  connection.onInitialize((params) => {
    discovery = new ProjectDiscovery(workspacePaths(params));
    registerWatchers =
      params.capabilities.workspace?.didChangeWatchedFiles
        ?.dynamicRegistration === true;
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

  connection.onInitialized(() => {
    if (!registerWatchers) return;
    void connection.client
      .register(DidChangeWatchedFilesNotification.type, {
        watchers: [
          { globPattern: "**/tsconfig*.json" },
          { globPattern: "**/*.shdr.ts" },
          { globPattern: "**/*.ts" },
        ],
      })
      .catch((error: unknown) =>
        connection.console.error(
          `Cannot register project file watches: ${String(error)}`,
        ),
      );
  });

  function release(uri: string, selection: ProjectSelection): void {
    if (selection.status !== "project") return;
    const project = projects.get(selection.configPath);
    if (!project) return;
    project.uris.delete(uri);
    if (
      ![...project.uris].some((other) => {
        const owner = documents.get(other)?.selection;
        return (
          owner?.status === "project" && owner.filePath === selection.filePath
        );
      })
    ) {
      project.adapter.closeDocument(selection.filePath);
    }
    if (project.uris.size === 0) {
      project.adapter.dispose();
      projects.delete(selection.configPath);
    }
  }

  function getProject(configPath: string): CheckedProject {
    let project = projects.get(configPath);
    if (!project) {
      project = {
        adapter: new TypeScript7EditorAdapter({
          cwd: dirname(configPath),
          projectFileName: configPath,
        }),
        uris: new Set(),
        configText: readFileSync(configPath, "utf8"),
      };
      projects.set(configPath, project);
    }
    return project;
  }

  function configurationChanged(): boolean {
    for (const [configPath, project] of projects) {
      try {
        if (readFileSync(configPath, "utf8") !== project.configText)
          return true;
      } catch {
        return true;
      }
    }
    return false;
  }

  function resetProjects(): void {
    for (const project of projects.values()) project.adapter.dispose();
    projects.clear();
    projectEpoch++;
  }

  function publishFailure(
    document: TextDocument,
    code: string,
    message: string,
  ): void {
    connection.sendDiagnostics({
      uri: document.uri,
      version: document.version,
      diagnostics: [
        {
          range: {
            start: document.positionAt(0),
            end: document.positionAt(Math.min(1, document.getText().length)),
          },
          message,
          code,
          source: "shdr-lsp",
          severity: DiagnosticSeverity.Error,
        },
      ],
    });
  }

  function publish(state: OpenShader): void {
    const { document } = state;
    const uri = document.uri;
    const previous = state.selection;
    let selection: ProjectSelection;
    try {
      selection = discovery?.select(uri) ?? {
        status: "outside-workspace",
        message: "No Shdr workspace is initialized.",
      };
    } catch (error) {
      connection.console.error(
        `Cannot discover Shdr project: ${String(error)}`,
      );
      selection = {
        status: "invalid-config",
        message: "Cannot select a TypeScript project for this Shdr file.",
      };
    }

    if (
      previous.status === "project" &&
      (selection.status !== "project" ||
        selection.configPath !== previous.configPath ||
        selection.filePath !== previous.filePath)
    ) {
      release(uri, previous);
      // Clear the old project's diagnostic before assigning a new owner.
      connection.sendDiagnostics({
        uri,
        version: document.version,
        diagnostics: [],
      });
    }
    state.selection = selection;

    if (selection.status !== "project") {
      if (selection.status === "ignored") return;
      publishFailure(
        document,
        {
          excluded: "SHDRLSP1001",
          "invalid-config": "SHDRLSP1002",
          "no-config": "SHDRLSP1003",
          "not-on-disk": "SHDRLSP1004",
          "outside-workspace": "SHDRLSP1005",
        }[selection.status],
        selection.message,
      );
      return;
    }

    try {
      const project = getProject(selection.configPath);
      // Two URIs for one real file can hold different unsaved text. Do not let
      // the later alias silently overwrite the first document's TS snapshot.
      const alias = [...project.uris].find((other) => {
        const owner = documents.get(other)?.selection;
        return (
          other !== uri &&
          owner?.status === "project" &&
          owner.filePath === selection.filePath
        );
      });
      if (alias) {
        state.selection = {
          status: "invalid-config",
          message: `This shader is already open as ${alias}. Close the other alias, then edit this document to recheck it.`,
        };
        publishFailure(document, "SHDRLSP1007", state.selection.message);
        return;
      }
      project.uris.add(uri);
      const checked = project.adapter.updateDocument({
        fileName: selection.filePath,
        source: document.getText(),
        version: document.version,
        projectVersion: projectEpoch,
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
    } catch (error) {
      connection.console.error(`Cannot check Shdr project: ${String(error)}`);
      release(uri, selection);
      state.selection = {
        status: "invalid-config",
        message: "Cannot check this Shdr TypeScript project.",
      };
      publishFailure(document, "SHDRLSP1006", state.selection.message);
    }
  }

  connection.onDidOpenTextDocument(({ textDocument }) => {
    if (!isShaderFile(textDocument.uri)) return;
    if (configurationChanged()) {
      discovery?.invalidate();
      resetProjects();
      for (const state of documents.values()) publish(state);
    }
    const previous = documents.get(textDocument.uri);
    if (previous && textDocument.version <= previous.document.version) return;
    if (previous) release(textDocument.uri, previous.selection);
    const state: OpenShader = {
      document: TextDocument.create(
        textDocument.uri,
        textDocument.languageId,
        textDocument.version,
        textDocument.text,
      ),
      selection: { status: "ignored" },
    };
    documents.set(textDocument.uri, state);
    publish(state);
  });

  connection.onDidChangeTextDocument(({ textDocument, contentChanges }) => {
    const state = documents.get(textDocument.uri);
    if (
      !state ||
      textDocument.version <= state.document.version ||
      contentChanges.length === 0
    )
      return;
    state.document = TextDocument.update(
      state.document,
      contentChanges,
      textDocument.version,
    );
    if (configurationChanged()) {
      discovery?.invalidate();
      resetProjects();
      for (const open of documents.values()) publish(open);
    } else {
      publish(state);
    }
  });

  connection.onDidChangeWatchedFiles(({ changes }) => {
    if (changes.length === 0) return;
    discovery?.invalidate();
    resetProjects();
    for (const state of documents.values()) publish(state);
  });

  connection.onDidCloseTextDocument(({ textDocument }) => {
    const state = documents.get(textDocument.uri);
    if (!state) return;
    release(textDocument.uri, state.selection);
    documents.delete(textDocument.uri);
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
  });

  connection.onHover(({ textDocument, position }, token) => {
    if (token.isCancellationRequested) return null;
    const state = documents.get(textDocument.uri);
    if (!state || state.selection.status !== "project") return null;
    const project = projects.get(state.selection.configPath);
    if (!project) return null;
    try {
      const checked = project.adapter.updateDocument({
        fileName: state.selection.filePath,
        source: state.document.getText(),
        version: state.document.version,
        projectVersion: projectEpoch,
      });
      const info = checked.getQuickInfoAtPosition(
        state.document.offsetAt(position),
      );
      if (!info) return null;
      return {
        contents: { kind: MarkupKind.PlainText, value: info.display },
        range: {
          start: state.document.positionAt(info.range.start),
          end: state.document.positionAt(info.range.start + info.range.length),
        },
      };
    } catch (error) {
      connection.console.error(`Cannot hover Shdr project: ${String(error)}`);
      return null;
    }
  });

  connection.onShutdown(() => {
    resetProjects();
    discovery?.dispose();
    discovery = undefined;
    documents.clear();
  });
  connection.onExit(() => {
    resetProjects();
    discovery?.dispose();
  });
  connection.listen();
}

function isShaderFile(uri: string): boolean {
  try {
    return fileURLToPath(uri).endsWith(".shdr.ts");
  } catch {
    return false;
  }
}

function workspacePaths(params: InitializeParams): string[] {
  const folders = params.workspaceFolders?.filter((folder) =>
    folder.uri.startsWith("file:"),
  );
  const uris = folders?.length
    ? folders.map((folder) => folder.uri)
    : params.rootUri?.startsWith("file:")
      ? [params.rootUri]
      : [];
  if (uris.length > 0) return uris.map((uri) => fileURLToPath(uri));
  return params.rootPath ? [params.rootPath] : [];
}
