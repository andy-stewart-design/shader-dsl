import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type PublishDiagnosticsParams,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { describe, expect, it } from "vitest";

const serverBin = fileURLToPath(new URL("../dist/bin.mjs", import.meta.url));
const project = fileURLToPath(
  new URL("../../language-service/test/fixtures/project/", import.meta.url),
);
const fileName = join(project, "gradient.shdr.ts");
const uri = pathToFileURL(fileName).href;
const source = readFileSync(fileName, "utf8");

function connect() {
  // Exercise the actual built stdio server with LSP Content-Length framing.
  const server = spawn(process.execPath, [serverBin], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = createMessageConnection(
    new StreamMessageReader(server.stdout),
    new StreamMessageWriter(server.stdin),
    console,
  );
  client.listen();
  const diagnostics: PublishDiagnosticsParams[] = [];
  client.onNotification("textDocument/publishDiagnostics", (params) => {
    diagnostics.push(params as PublishDiagnosticsParams);
  });

  return {
    client,
    diagnostics,
    async initialize() {
      const result = await client.sendRequest<{ capabilities: object }>(
        "initialize",
        {
          processId: null,
          rootUri: pathToFileURL(project).href,
          capabilities: {},
        },
      );
      client.sendNotification("initialized", {});
      return result;
    },
    async nextDiagnostics(version?: number): Promise<PublishDiagnosticsParams> {
      // A request after a notification serves as a transport-order barrier.
      await client.sendRequest("textDocument/hover", {
        textDocument: { uri },
        position: { line: 0, character: 0 },
      });
      const result = diagnostics.at(-1);
      expect(
        result,
        "expected publishDiagnostics after document update",
      ).toBeDefined();
      if (version !== undefined) expect(result?.version).toBe(version);
      return result!;
    },
    async close() {
      const exited = once(server, "exit");
      try {
        await client.sendRequest("shutdown");
        client.sendNotification("exit");
        const [exitCode] = await exited;
        expect(exitCode).toBe(0);
      } finally {
        client.dispose();
        server.kill();
      }
    },
  };
}

function positionAt(text: string, offset: number) {
  return TextDocument.create(uri, "shdr-typescript", 1, text).positionAt(
    offset,
  );
}

describe("Shdr LSP protocol", () => {
  it("publishes original-source ranges and hover through the shared adapter", async () => {
    const session = connect();
    try {
      const initialize = await session.initialize();
      expect(initialize.capabilities).toMatchObject({
        hoverProvider: true,
        textDocumentSync: { openClose: true, change: 2 },
      });
      session.client.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: "shdr-typescript",
          version: 1,
          text: source,
        },
      });
      expect((await session.nextDiagnostics(1)).diagnostics).toEqual([]);

      const hover = await session.client.sendRequest<{
        contents: { value: string };
        range: { start: object; end: object };
      }>("textDocument/hover", {
        textDocument: { uri },
        position: positionAt(source, source.indexOf("uv.x")),
      });
      expect(hover.contents.value).toBe("Expr<Vec2<F32>>");
      expect(hover.range).toEqual({
        start: positionAt(source, source.indexOf("uv.x")),
        end: positionAt(source, source.indexOf("uv.x") + 2),
      });

      const invalid = source.replace(
        "coord.xy / uniforms.resolution",
        "coord.xy / coord",
      );
      session.client.sendNotification("textDocument/didChange", {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: invalid }],
      });
      const published = await session.nextDiagnostics(2);
      expect(published.diagnostics).toEqual([
        expect.objectContaining({
          code: 2769,
          source: "shdr",
          range: {
            start: positionAt(invalid, invalid.indexOf("coord.xy / coord")),
            end: positionAt(
              invalid,
              invalid.indexOf("coord.xy / coord") + "coord.xy / coord".length,
            ),
          },
        }),
      ]);
      expect(published.diagnostics[0]?.message).not.toContain(
        "__shdr_internal",
      );

      // Out-of-order edits must not roll diagnostics or hover back to old text.
      session.client.sendNotification("textDocument/didChange", {
        textDocument: { uri, version: 1 },
        contentChanges: [{ text: source }],
      });
      const count = session.diagnostics.length;
      await session.client.sendRequest("textDocument/hover", {
        textDocument: { uri },
        position: positionAt(invalid, invalid.indexOf("uv.x")),
      });
      expect(session.diagnostics).toHaveLength(count);

      // An incremental edit is supported as well as a full-text change.
      const start = invalid.indexOf("coord.xy / coord");
      session.client.sendNotification("textDocument/didChange", {
        textDocument: { uri, version: 3 },
        contentChanges: [
          {
            range: {
              start: positionAt(invalid, start),
              end: positionAt(invalid, start + "coord.xy / coord".length),
            },
            text: "coord.xy / uniforms.resolution",
          },
        ],
      });
      expect((await session.nextDiagnostics(3)).diagnostics).toEqual([]);

      session.client.sendNotification("textDocument/didClose", {
        textDocument: { uri },
      });
      expect((await session.nextDiagnostics()).diagnostics).toEqual([]);
      expect(
        await session.client.sendRequest("textDocument/hover", {
          textDocument: { uri },
          position: positionAt(source, source.indexOf("uv.x")),
        }),
      ).toBeNull();

      const ordinaryUri = pathToFileURL(join(project, "ordinary.ts")).href;
      const countAfterClose = session.diagnostics.length;
      session.client.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: ordinaryUri,
          languageId: "typescript",
          version: 1,
          text: "const ordinary = 1;",
        },
      });
      expect(
        await session.client.sendRequest("textDocument/hover", {
          textDocument: { uri: ordinaryUri },
          position: { line: 0, character: 6 },
        }),
      ).toBeNull();
      expect(session.diagnostics).toHaveLength(countAfterClose);
    } finally {
      await session.close();
    }
  });

  it("recovers from unsupported shader syntax and TypeScript parse errors", async () => {
    const session = connect();
    try {
      await session.initialize();
      const unsupported = source.replace("const sameLength", "let sameLength");
      session.client.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: "shdr-typescript",
          version: 1,
          text: unsupported,
        },
      });
      expect((await session.nextDiagnostics(1)).diagnostics).toEqual([
        expect.objectContaining({ source: "shdr", code: "SHDR1100" }),
      ]);

      const malformed = source.replace(/\n\}\);\s*$/, "\n");
      session.client.sendNotification("textDocument/didChange", {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: malformed }],
      });
      expect((await session.nextDiagnostics(2)).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: "ts", code: 1005 }),
        ]),
      );
      session.client.sendNotification("textDocument/didChange", {
        textDocument: { uri, version: 3 },
        contentChanges: [{ text: source }],
      });
      expect((await session.nextDiagnostics(3)).diagnostics).toEqual([]);
    } finally {
      await session.close();
    }
  });
});
