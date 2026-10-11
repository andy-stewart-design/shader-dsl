import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

const bin = fileURLToPath(new URL("../dist/bin.mjs", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const editorShader = join(root, "apps/editor-fixture/expanded.shdr.ts");
const otherShader = join(
  root,
  "packages/lsp/test/fixtures/project-b/independent.shdr.ts",
);
const projectCHelper = join(
  root,
  "packages/lsp/test/fixtures/project-c/helper.shdr.ts",
);
const projectCEntry = join(
  root,
  "packages/lsp/test/fixtures/project-c/entry.shdr.ts",
);
const projectDMixed = join(
  root,
  "packages/lsp/test/fixtures/project-d/mixed.shdr.ts",
);
const projectDEntry = join(
  root,
  "packages/lsp/test/fixtures/project-d/entry.shdr.ts",
);
const original = readFileSync(otherShader, "utf8");

function uri(path: string): string {
  return pathToFileURL(path).href;
}

function positionAt(path: string, text: string, offset: number) {
  return TextDocument.create(uri(path), "shdr-typescript", 1, text).positionAt(
    offset,
  );
}

function connect(workspace: string) {
  const server = spawn(process.execPath, [bin], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = createMessageConnection(
    new StreamMessageReader(server.stdout),
    new StreamMessageWriter(server.stdin),
    console,
  );
  const published: PublishDiagnosticsParams[] = [];
  client.onNotification("textDocument/publishDiagnostics", (params) => {
    published.push(params as PublishDiagnosticsParams);
  });
  client.listen();
  return {
    client,
    published,
    async initialize() {
      await client.sendRequest("initialize", {
        processId: null,
        rootUri: uri(workspace),
        capabilities: {},
      });
      client.sendNotification("initialized", {});
    },
    async diagnostics(path: string, version?: number) {
      // Requests after notifications form a protocol-order barrier.
      await client.sendRequest("textDocument/hover", {
        textDocument: { uri: uri(path) },
        position: { line: 0, character: 0 },
      });
      const result = [...published]
        .reverse()
        .find((item) => item.uri === uri(path));
      expect(result, `expected diagnostics for ${path}`).toBeDefined();
      if (version !== undefined) expect(result?.version).toBe(version);
      return result!.diagnostics;
    },
    open(path: string, text: string, version = 1) {
      client.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: uri(path),
          languageId: "shdr-typescript",
          version,
          text,
        },
      });
    },
    change(path: string, text: string, version: number) {
      client.sendNotification("textDocument/didChange", {
        textDocument: { uri: uri(path), version },
        contentChanges: [{ text }],
      });
    },
    watched(path: string, type = 2) {
      client.sendNotification("workspace/didChangeWatchedFiles", {
        changes: [{ uri: uri(path), type }],
      });
    },
    async close() {
      const exited = once(server, "exit");
      try {
        await client.sendRequest("shutdown");
        client.sendNotification("exit");
        expect((await exited)[0]).toBe(0);
      } finally {
        client.dispose();
        server.kill();
      }
    },
  };
}

describe("project-aware built LSP process", () => {
  it("selects independent projects from the repository root, isolates diagnostics and hovers", async () => {
    const session = connect(root);
    const editorSource = readFileSync(editorShader, "utf8");
    try {
      await session.initialize();
      session.open(editorShader, editorSource);
      expect(await session.diagnostics(editorShader, 1)).toEqual([]);
      session.open(otherShader, original);
      expect(await session.diagnostics(otherShader, 1)).toEqual([]);

      for (const [path, text] of [
        [editorShader, editorSource],
        [otherShader, original],
      ] as const) {
        const hover = await session.client.sendRequest<{
          contents: { value: string };
        }>("textDocument/hover", {
          textDocument: { uri: uri(path) },
          position: positionAt(
            path,
            text,
            text.includes("uv.x")
              ? text.indexOf("uv.x")
              : text.indexOf("vec2(uv)") + 5,
          ),
        });
        expect(hover.contents.value).toBe("Expr<Vec2<F32>>");
      }

      const invalidOther = original.replace(
        "coord.xy / uniforms.resolution",
        "coord.xy / coord",
      );
      session.change(otherShader, invalidOther, 2);
      expect(await session.diagnostics(otherShader, 2)).toEqual([
        expect.objectContaining({
          source: "shdr",
          code: 2769,
          range: {
            start: positionAt(
              otherShader,
              invalidOther,
              invalidOther.indexOf("coord.xy / coord"),
            ),
            end: positionAt(
              otherShader,
              invalidOther,
              invalidOther.indexOf("coord.xy / coord") +
                "coord.xy / coord".length,
            ),
          },
        }),
      ]);
      expect(await session.diagnostics(editorShader, 1)).toEqual([]);
      const invalidEditor = editorSource.replace(
        "vec2(coord.x, coord.y) / uniforms.resolution",
        "vec2(coord.x, coord.y) / coord",
      );
      session.change(editorShader, invalidEditor, 2);
      expect(await session.diagnostics(editorShader, 2)).toEqual([
        expect.objectContaining({ source: "shdr", code: 2769 }),
      ]);
      expect((await session.diagnostics(otherShader, 2))[0]?.code).toBe(2769);

      // An older edit cannot overwrite the latest document even in another project.
      const count = session.published.length;
      session.change(otherShader, original, 1);
      await session.client.sendRequest("textDocument/hover", {
        textDocument: { uri: uri(otherShader) },
        position: { line: 0, character: 0 },
      });
      expect(session.published).toHaveLength(count);
    } finally {
      await session.close();
    }
  });

  it("routes cross-file helper hovers and diagnostics to the owning source", async () => {
    const session = connect(join(root, "packages/lsp/test/fixtures/project-c"));
    const helperSource = readFileSync(projectCHelper, "utf8");
    const entrySource = readFileSync(projectCEntry, "utf8");
    try {
      await session.initialize();
      session.open(projectCHelper, helperSource);
      session.open(projectCEntry, entrySource);
      expect(await session.diagnostics(projectCHelper, 1)).toEqual([]);
      expect(await session.diagnostics(projectCEntry, 1)).toEqual([]);

      const helperHover = await session.client.sendRequest<{
        contents: { value: string };
      }>("textDocument/hover", {
        textDocument: { uri: uri(projectCHelper) },
        position: positionAt(
          projectCHelper,
          helperSource,
          helperSource.indexOf("scale ="),
        ),
      });
      expect(helperHover.contents.value).toContain("ShaderFunction");
      const entryHover = await session.client.sendRequest<{
        contents: { value: string };
      }>("textDocument/hover", {
        textDocument: { uri: uri(projectCEntry) },
        position: positionAt(
          projectCEntry,
          entrySource,
          entrySource.indexOf("scale("),
        ),
      });
      expect(entryHover.contents.value).toContain("Expr<F32>");

      const widenedHelper = helperSource
        .replace("import type { Expr, F32 }", "import type { Expr, F32, Vec2 }")
        .replace("Expr<F32>", "Expr<Vec2<F32>>");
      session.change(projectCHelper, widenedHelper, 2);
      const refreshedEntryHover = await session.client.sendRequest<{
        contents: { value: string };
      }>("textDocument/hover", {
        textDocument: { uri: uri(projectCEntry) },
        position: positionAt(
          projectCEntry,
          entrySource,
          entrySource.indexOf("scale("),
        ),
      });
      expect(refreshedEntryHover.contents.value).toContain("Expr<Vec2<F32>>");
      expect(await session.diagnostics(projectCEntry, 1)).toEqual([
        expect.objectContaining({ source: "shdr", code: "SHDR1213" }),
      ]);

      session.change(projectCHelper, helperSource, 3);
      expect(await session.diagnostics(projectCHelper, 3)).toEqual([]);
      expect(await session.diagnostics(projectCEntry, 1)).toEqual([]);

      const invalidHelper = helperSource
        .replace(
          "import { defineShaderFunction }",
          "import { defineShaderFunction, sqrt }",
        )
        .replace("x * 0.5", "sqrt(-1)");
      session.change(projectCHelper, invalidHelper, 4);
      expect(await session.diagnostics(projectCHelper, 4)).toEqual([
        expect.objectContaining({ source: "shdr", code: "SHDR1209" }),
      ]);
      expect(await session.diagnostics(projectCEntry, 1)).toEqual([]);

      session.change(projectCHelper, helperSource, 5);
      expect(await session.diagnostics(projectCHelper, 5)).toEqual([]);

      const invalidEntry = entrySource.replace(
        "scale(uniforms.time)",
        "scale()",
      );
      session.change(projectCEntry, invalidEntry, 2);
      expect(await session.diagnostics(projectCEntry, 2)).toEqual([
        expect.objectContaining({ source: "shdr", code: "SHDR1213" }),
      ]);
      expect(await session.diagnostics(projectCHelper, 5)).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("refreshes callers when a mixed module loses its last helper marker", async () => {
    const session = connect(join(root, "packages/lsp/test/fixtures/project-d"));
    const mixedSource = readFileSync(projectDMixed, "utf8");
    const entrySource = readFileSync(projectDEntry, "utf8");
    try {
      await session.initialize();
      session.open(projectDMixed, mixedSource);
      session.open(projectDEntry, entrySource);
      expect(await session.diagnostics(projectDEntry, 1)).toEqual([]);

      const withoutHelper = mixedSource
        .replace(
          "createFragmentShader, defineShaderFunction, vec4",
          "createFragmentShader, vec4",
        )
        .replace('import type { Expr, F32 } from "shdr";\n\n', "")
        .replace(
          "export const scale = defineShaderFunction((x: Expr<F32>) => x * 0.5);\n\n",
          "",
        )
        .replace("vec4(scale(uniforms.time))", "vec4(uniforms.time)");
      session.change(projectDMixed, withoutHelper, 2);
      expect(await session.diagnostics(projectDMixed, 2)).toEqual([]);
      expect(await session.diagnostics(projectDEntry, 1)).toEqual([
        expect.objectContaining({ source: "shdr", code: "SHDR1302" }),
      ]);

      session.change(projectDMixed, mixedSource, 3);
      expect(await session.diagnostics(projectDMixed, 3)).toEqual([]);
      expect(await session.diagnostics(projectDEntry, 1)).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("clears stale diagnostics on project switches and publishes explicit configuration errors", async () => {
    // Put the temporary project under @shdr/lsp so TypeScript resolves its
    // actual shdr dependency; do not modify the authored shader fixtures.
    const temporary = realpathSync(
      mkdtempSync(join(root, "packages/lsp/test/fixtures/.config-switch-")),
    );
    const child = join(temporary, "child");
    mkdirSync(child);
    const config = join(temporary, "tsconfig.json");
    const childConfig = join(child, "tsconfig.json");
    const shader = join(child, "switch.shdr.ts");
    const text = original;
    writeFileSync(shader, text);
    writeFileSync(join(child, "ordinary.ts"), "export const ordinary = 1;\n");
    writeFileSync(join(temporary, "root.ts"), "export const root = 1;\n");
    writeFileSync(
      config,
      JSON.stringify({
        compilerOptions: {
          module: "esnext",
          moduleResolution: "bundler",
          noEmit: true,
        },
        include: ["child/*.shdr.ts"],
      }),
    );
    writeFileSync(childConfig, JSON.stringify({ include: ["ordinary.ts"] }));
    const session = connect(temporary);
    try {
      await session.initialize();
      session.open(shader, text);
      expect(await session.diagnostics(shader, 1)).toEqual([]);
      const firstHover = await session.client.sendRequest<{
        contents: { value: string };
      }>("textDocument/hover", {
        textDocument: { uri: uri(shader) },
        position: positionAt(shader, text, text.indexOf("uv.x")),
      });
      expect(firstHover.contents.value).toBe("Expr<Vec2<F32>>");

      const invalid = text.replace(
        "coord.xy / uniforms.resolution",
        "coord.xy / coord",
      );
      session.change(shader, invalid, 2);
      expect(await session.diagnostics(shader, 2)).toEqual([
        expect.objectContaining({ code: 2769 }),
      ]);
      writeFileSync(config, JSON.stringify({ include: ["root.ts"] }));
      session.watched(config);
      expect(await session.diagnostics(shader, 2)).toEqual([
        expect.objectContaining({ source: "shdr-lsp", code: "SHDRLSP1001" }),
      ]);
      expect(
        session.published.some(
          (item) =>
            item.uri === uri(shader) &&
            item.version === 2 &&
            item.diagnostics.length === 0,
        ),
      ).toBe(true);
      expect(
        await session.client.sendRequest("textDocument/hover", {
          textDocument: { uri: uri(shader) },
          position: { line: 0, character: 5 },
        }),
      ).toBeNull();

      writeFileSync(
        childConfig,
        JSON.stringify({
          compilerOptions: {
            module: "esnext",
            moduleResolution: "bundler",
            noEmit: true,
          },
          include: ["*.shdr.ts"],
        }),
      );
      session.watched(childConfig);
      expect(await session.diagnostics(shader, 2)).toEqual([
        expect.objectContaining({ code: 2769 }),
      ]);
      writeFileSync(
        childConfig,
        '{"compilerOptions":{"unknownSetting":true},"include":["*.shdr.ts"]}',
      );
      session.watched(childConfig);
      expect(await session.diagnostics(shader, 2)).toEqual([
        expect.objectContaining({ source: "shdr-lsp", code: "SHDRLSP1002" }),
      ]);
      writeFileSync(
        childConfig,
        JSON.stringify({
          compilerOptions: {
            module: "esnext",
            moduleResolution: "bundler",
            noEmit: true,
          },
          include: ["*.shdr.ts"],
        }),
      );
      session.watched(childConfig);
      expect(await session.diagnostics(shader, 2)).toEqual([
        expect.objectContaining({ code: 2769 }),
      ]);
      session.change(shader, text, 3);
      expect(await session.diagnostics(shader, 3)).toEqual([]);

      // A client with no file watchers still notices its active config on the
      // next shader edit, without restarting the server or Zed worktree.
      writeFileSync(childConfig, JSON.stringify({ include: ["ordinary.ts"] }));
      session.change(shader, invalid, 4);
      expect(await session.diagnostics(shader, 4)).toEqual([
        expect.objectContaining({ source: "shdr-lsp", code: "SHDRLSP1001" }),
      ]);

      session.client.sendNotification("textDocument/didClose", {
        textDocument: { uri: uri(shader) },
      });
      expect(await session.diagnostics(shader)).toEqual([]);
    } finally {
      await session.close();
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("does not silently share one TypeScript snapshot between two file-URI aliases", async () => {
    const alias = join(
      root,
      "packages/lsp/test/fixtures/project-b/.alias.shdr.ts",
    );
    symlinkSync(otherShader, alias);
    const session = connect(root);
    try {
      await session.initialize();
      session.open(otherShader, original);
      expect(await session.diagnostics(otherShader, 1)).toEqual([]);
      session.open(
        alias,
        original.replace("coord.xy / uniforms.resolution", "coord.xy / coord"),
      );
      expect(await session.diagnostics(alias, 1)).toEqual([
        expect.objectContaining({ source: "shdr-lsp", code: "SHDRLSP1007" }),
      ]);
      expect(await session.diagnostics(otherShader, 1)).toEqual([]);
      session.client.sendNotification("textDocument/didClose", {
        textDocument: { uri: uri(otherShader) },
      });
      expect(await session.diagnostics(otherShader)).toEqual([]);
      session.change(alias, original, 2);
      expect(await session.diagnostics(alias, 2)).toEqual([]);
    } finally {
      await session.close();
      rmSync(alias, { force: true });
    }
  });

  it("re-reads inherited TypeScript config when watched-file notifications arrive", async () => {
    const temporary = realpathSync(
      mkdtempSync(join(root, "packages/lsp/test/fixtures/.inherited-config-")),
    );
    const child = join(temporary, "child");
    mkdirSync(child);
    const base = join(temporary, "tsconfig.base.json");
    const config = join(child, "tsconfig.json");
    const shader = join(child, "inherited.shdr.ts");
    writeFileSync(
      base,
      JSON.stringify({
        compilerOptions: {
          module: "esnext",
          moduleResolution: "bundler",
          noEmit: true,
        },
      }),
    );
    writeFileSync(
      config,
      JSON.stringify({
        extends: "../tsconfig.base.json",
        include: ["*.shdr.ts"],
      }),
    );
    writeFileSync(shader, original);
    const session = connect(temporary);
    try {
      await session.initialize();
      session.open(shader, original);
      expect(await session.diagnostics(shader, 1)).toEqual([]);
      writeFileSync(
        base,
        JSON.stringify({ compilerOptions: { invalidOption: true } }),
      );
      session.watched(base);
      expect(await session.diagnostics(shader, 1)).toEqual([
        expect.objectContaining({ source: "shdr-lsp", code: "SHDRLSP1002" }),
      ]);
      writeFileSync(
        base,
        JSON.stringify({
          compilerOptions: {
            module: "esnext",
            moduleResolution: "bundler",
            noEmit: true,
          },
        }),
      );
      session.watched(base);
      expect(await session.diagnostics(shader, 1)).toEqual([]);
    } finally {
      await session.close();
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("reports unconfigured, unsaved, and external shaders without touching ordinary TypeScript", async () => {
    const temporary = realpathSync(
      mkdtempSync(join(root, "packages/lsp/test/fixtures/.no-config-")),
    );
    const shader = join(temporary, "unconfigured.shdr.ts");
    const missing = join(temporary, "unsaved.shdr.ts");
    const ordinary = join(temporary, "ordinary.ts");
    writeFileSync(shader, original);
    const session = connect(temporary);
    try {
      await session.initialize();
      session.open(shader, original);
      expect(await session.diagnostics(shader, 1)).toEqual([
        expect.objectContaining({ source: "shdr-lsp", code: "SHDRLSP1003" }),
      ]);
      session.open(missing, original);
      expect(await session.diagnostics(missing, 1)).toEqual([
        expect.objectContaining({ source: "shdr-lsp", code: "SHDRLSP1004" }),
      ]);
      session.open(otherShader, original);
      expect(await session.diagnostics(otherShader, 1)).toEqual([
        expect.objectContaining({ source: "shdr-lsp", code: "SHDRLSP1005" }),
      ]);
      const count = session.published.length;
      session.open(ordinary, "const ordinary = 1;");
      expect(
        await session.client.sendRequest("textDocument/hover", {
          textDocument: { uri: uri(ordinary) },
          position: { line: 0, character: 6 },
        }),
      ).toBeNull();
      expect(session.published).toHaveLength(count);
    } finally {
      await session.close();
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
