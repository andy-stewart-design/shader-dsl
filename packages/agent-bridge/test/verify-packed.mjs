import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

const packageRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const checkoutRoot = resolve(packageRoot, "../..");
const origin = "https://packed-bridge.example.test";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const expectedLimits = {
  authenticationTimeoutMs: 5_000,
  requestTimeoutMs: 30_000,
  imageBytes: 4 * 1024 * 1024,
  pendingCalls: 8,
  tools: 64,
};

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

async function runAsync(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolvePromise({ stdout, stderr });
    });
  });
}

async function packageArtifact(tempRoot) {
  const output = run("pnpm", ["pack", "--pack-destination", tempRoot]);
  const match = output.match(/(?:^|\n)([^\n]*\.tgz)\n?$/m);
  const candidate = match ? resolve(packageRoot, match[1]) : undefined;
  const tarball =
    candidate && existsSync(candidate)
      ? candidate
      : join(tempRoot, "shdr-agent-bridge-0.0.0.tgz");
  assert.ok(existsSync(tarball), "pnpm pack did not produce a tarball");
  return tarball;
}

async function inspectArtifact(tarball) {
  const listing = run("tar", ["-tzf", tarball])
    .trim()
    .split("\n")
    .filter(Boolean);
  const forbidden =
    /(^|\/)(src|test|tests|apps|\.pi|\.env|\.vercel|credentials|fixtures)(\/|$)|(?:secret|token|password)/i;
  assert.ok(listing.length > 0, "tarball is empty");
  assert.ok(
    listing.every((name) => !forbidden.test(name)),
    `forbidden tarball entry: ${listing.join(", ")}`,
  );
  const allowed = new Set(["package/package.json", "package/README.md"]);
  for (const name of listing) {
    if (name.startsWith("package/dist/")) allowed.add(name);
    else assert.ok(allowed.has(name), `unexpected tarball entry: ${name}`);
  }
  for (const entry of [
    "package/package.json",
    "package/README.md",
    "package/dist/bin.mjs",
    "package/dist/browser.mjs",
    "package/dist/index.mjs",
    "package/dist/protocol.mjs",
    "package/dist/server.mjs",
    "package/dist/zod.mjs",
    "package/dist/react.mjs",
    "package/dist/react.d.mts",
  ])
    assert.ok(listing.includes(entry), `missing packaged entry: ${entry}`);

  const metadata = JSON.parse(
    run("tar", ["-xOf", tarball, "package/package.json"]),
  );
  assert.equal(metadata.bin["shdr-agent-bridge"], "./dist/bin.mjs");
  assert.equal(metadata.engines?.node, ">=24");
  assert.deepEqual(
    metadata.exports["./protocol"].import,
    "./dist/protocol.mjs",
  );
  assert.deepEqual(metadata.exports["./browser"].import, "./dist/browser.mjs");
  assert.deepEqual(metadata.exports["./server"].import, "./dist/server.mjs");
  assert.deepEqual(metadata.exports["./zod"].import, "./dist/zod.mjs");
  assert.deepEqual(metadata.exports["./react"].import, "./dist/react.mjs");
  assert.deepEqual(metadata.exports["./react"].types, "./dist/react.d.mts");
  assert.equal(metadata.peerDependencies?.react, ">=18");
  assert.equal(metadata.peerDependenciesMeta?.react?.optional, true);
  assert.deepEqual(Object.keys(metadata.dependencies).sort(), [
    "@modelcontextprotocol/sdk",
    "ajv",
    "ws",
    "zod",
  ]);

  const details = run("tar", ["-tvzf", tarball]);
  const binLine = details
    .split("\n")
    .find((line) => line.endsWith(" package/dist/bin.mjs"));
  assert.ok(
    binLine?.startsWith("-rwx"),
    `CLI is not executable in tarball: ${binLine ?? "missing"}`,
  );
  const binText = run("tar", ["-xOf", tarball, "package/dist/bin.mjs"]);
  assert.ok(
    binText.startsWith("#!/usr/bin/env node\n"),
    "CLI hashbang is missing",
  );
  return { listing, metadata };
}

async function installConsumer(tempRoot, tarball) {
  const consumer = join(tempRoot, "consumer");
  await (await import("node:fs/promises")).mkdir(consumer, { recursive: true });
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }, null, 2),
  );
  await runAsync("pnpm", ["add", "--offline", "--ignore-scripts", tarball], {
    cwd: consumer,
    env: {
      ...process.env,
      NODE_PATH: "",
      npm_config_ignore_scripts: "true",
      npm_config_auto_install_peers: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.ok(existsSync(consumer), "offline consumer was not created");
  assert.ok(
    !existsSync(join(consumer, "node_modules/react")),
    "optional React peer was installed for the browser consumer",
  );
  const installed = join(consumer, "node_modules/@shdr/agent-bridge");
  assert.ok(
    existsSync(join(installed, "package.json")),
    "tarball package is not installed",
  );
  const installedReal = realpathSync(installed);
  assert.ok(
    !installedReal.startsWith(packageRoot),
    "installed package resolves to checkout source",
  );
  const dependencyBases = [
    join(consumer, "node_modules"),
    join(consumer, "node_modules/.pnpm/node_modules"),
    dirname(dirname(installed)),
  ];
  for (const dependency of ["@modelcontextprotocol/sdk", "ajv", "ws", "zod"]) {
    const dependencyPath = dependencyBases
      .map((base) => join(base, ...dependency.split("/")))
      .find((candidate) => existsSync(candidate));
    assert.ok(dependencyPath, `consumer dependency missing: ${dependency}`);
    assert.ok(
      !realpathSync(dependencyPath).startsWith(checkoutRoot),
      `dependency resolves to checkout: ${dependency}`,
    );
  }
  return { consumer, installed, installedReal };
}

async function installReactConsumer(consumer) {
  const reactPackage = JSON.parse(
    await readFile(
      join(packageRoot, "node_modules/react/package.json"),
      "utf8",
    ),
  );
  await runAsync(
    "pnpm",
    ["add", "--offline", "--ignore-scripts", `react@${reactPackage.version}`],
    {
      cwd: consumer,
      env: {
        ...process.env,
        NODE_PATH: "",
        npm_config_ignore_scripts: "true",
        npm_config_auto_install_peers: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  assert.ok(
    existsSync(join(consumer, "node_modules/react/package.json")),
    "React was not installed in the isolated consumer",
  );
}

async function checkInstalledExports(consumer) {
  const check = join(consumer, "check-exports.mjs");
  await writeFile(
    check,
    `
    const browser = await import("@shdr/agent-bridge/browser");
    const zod = await import("@shdr/agent-bridge/zod");
    const protocol = await import("@shdr/agent-bridge/protocol");
    const server = await import("@shdr/agent-bridge/server");
    if (typeof browser.connectAgentBridge !== "function" || typeof browser.imageResult !== "function") throw new Error("browser exports missing");
    if (typeof zod.defineTool !== "function" || typeof zod.z?.strictObject !== "function") throw new Error("zod export missing");
    if (protocol.BRIDGE_PROTOCOL_VERSION !== 1) throw new Error("protocol export missing");
    if (typeof server.startBridgeServer !== "function") throw new Error("server export missing");
    if (typeof window !== "undefined") throw new Error("SSR check unexpectedly has window");
  `,
  );
  const result = spawnSync(process.execPath, [check], {
    cwd: consumer,
    env: { ...process.env, NODE_PATH: "" },
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `installed export import failed: ${result.stderr}`,
  );
}

async function checkInstalledReactExport(consumer) {
  const check = join(consumer, "check-react-export.mjs");
  await writeFile(
    check,
    `
    const React = await import("react");
    const adapter = await import("@shdr/agent-bridge/react");
    if (typeof React.createElement !== "function") throw new Error("React SSR import missing");
    if (typeof adapter.AgentBridgeProvider !== "function" || typeof adapter.useAgentBridge !== "function") throw new Error("React export missing");
    if (typeof window !== "undefined") throw new Error("React export SSR check unexpectedly has window");
  `,
  );
  const result = spawnSync(process.execPath, [check], {
    cwd: consumer,
    env: { ...process.env, NODE_PATH: "" },
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `installed React export import failed: ${result.stderr}`,
  );
}

function nextMessage(socket) {
  return new Promise((resolvePromise, reject) => {
    const onMessage = (data) => {
      cleanup();
      try {
        resolvePromise(JSON.parse(data.toString()));
      } catch (error) {
        reject(error);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    socket.once("message", onMessage);
    socket.once("error", onError);
  });
}

function mcpJson(result) {
  assert.ok(
    result?.content?.[0]?.type === "text",
    "MCP response lacks text envelope",
  );
  return JSON.parse(result.content[0].text);
}

async function checkInstalledCli(consumer) {
  const bin = join(consumer, "node_modules/.bin/shdr-agent-bridge");
  assert.ok(existsSync(bin), "installed executable is missing");
  assert.ok(statSync(bin).mode & 0o111, "installed executable bit is missing");
  const transport = new StdioClientTransport({
    command: bin,
    args: ["--allowed-origin", origin, "--site-url", `${origin}/demo/`],
    cwd: consumer,
    stderr: "pipe",
    env: { HOME: process.env.HOME, PATH: process.env.PATH, NODE_PATH: "" },
  });
  const client = new Client({ name: "packed-verifier", version: "1" });
  let socket;
  try {
    await client.connect(transport);
    const infoResult = await client.callTool({
      name: "bridge_get_connection_info",
      arguments: {},
    });
    const info = mcpJson(infoResult);
    assert.equal(info.status, "unpaired");
    assert.equal(info.port > 0 && info.port < 65536, true);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(expectedLimits).map(([key, value]) => [
          key,
          info.limits[key],
        ]),
      ),
      expectedLimits,
    );
    const pairing = new URL(info.pairingUrl);
    assert.equal(pairing.origin, origin);
    assert.equal(pairing.search, "");
    const params = new URLSearchParams(pairing.hash.slice(1));
    const token = params.get("bridgeToken");
    assert.ok(
      token && params.get("bridgePort"),
      "pairing fragment lacks credentials",
    );

    socket = new WebSocket(`ws://127.0.0.1:${info.port}`, { origin });
    await new Promise((resolvePromise, reject) => {
      socket.once("open", resolvePromise);
      socket.once("error", reject);
    });
    socket.send(JSON.stringify({ type: "auth", token }));
    const auth = await nextMessage(socket);
    assert.equal(auth.type, "auth_ok");
    assert.equal(auth.protocolVersion, 1);
    assert.ok(auth.sessionId);
    const tool = {
      name: "packed_image",
      description: "Return one finite PNG image for artifact verification",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    };
    socket.send(
      JSON.stringify({
        type: "catalog",
        protocolVersion: 1,
        catalogVersion: 1,
        sessionId: auth.sessionId,
        tools: [tool],
      }),
    );
    assert.deepEqual(await nextMessage(socket), {
      type: "catalog_ok",
      protocolVersion: 1,
      sessionId: auth.sessionId,
      catalogVersion: 1,
    });

    const listed = mcpJson(
      await client.callTool({
        name: "bridge_list_tools",
        arguments: { sessionId: auth.sessionId },
      }),
    );
    assert.equal(listed.catalogVersion, 1);
    assert.deepEqual(
      listed.tools.map(({ name }) => name),
      ["packed_image"],
    );
    const described = mcpJson(
      await client.callTool({
        name: "bridge_describe_tool",
        arguments: { sessionId: auth.sessionId, name: "packed_image" },
      }),
    );
    assert.equal(described.name, "packed_image");

    const invalid = await client.callTool({
      name: "bridge_call_tool",
      arguments: {
        sessionId: auth.sessionId,
        catalogVersion: 1,
        name: "packed_image",
        arguments: { unexpected: true },
      },
    });
    assert.equal(invalid.isError, true);
    assert.match(
      invalid.content?.map((part) => part.text ?? "").join(" "),
      /invalid_arguments/,
    );

    const callPromise = client.callTool({
      name: "bridge_call_tool",
      arguments: {
        sessionId: auth.sessionId,
        catalogVersion: 1,
        name: "packed_image",
        arguments: {},
      },
    });
    const request = await nextMessage(socket);
    assert.equal(request.type, "request");
    assert.equal(request.sessionId, auth.sessionId);
    socket.send(
      JSON.stringify({
        type: "response",
        requestId: request.requestId,
        sessionId: auth.sessionId,
        catalogVersion: 1,
        ok: true,
        result: {
          bridgeResultVersion: 1,
          content: [
            { type: "text", text: "installed artifact image" },
            { type: "image", mimeType: "image/png", data: png },
          ],
          metadata: { width: 1, height: 1, source: "packed-test" },
        },
      }),
    );
    const called = await callPromise;
    assert.equal(called.isError, undefined);
    assert.ok(
      called.content.some(
        (part) =>
          part.type === "image" &&
          part.mimeType === "image/png" &&
          part.data === png,
      ),
      "MCP image block was not delivered",
    );
    assert.ok(
      called.content.some(
        (part) => part.type === "text" && part.text.includes("packed-test"),
      ),
      "image metadata was not delivered",
    );
  } finally {
    if (socket) socket.terminate();
    try {
      await client.close();
    } catch {}
    try {
      await transport.close();
    } catch {}
  }
}

async function checkBrowserBundle(consumer, tempRoot) {
  const entry = join(consumer, "browser-entry.mjs");
  const config = join(consumer, "vite.config.mjs");
  await writeFile(
    entry,
    `
    import { connectAgentBridge, imageResult } from "@shdr/agent-bridge/browser";
    import { BRIDGE_PROTOCOL_VERSION } from "@shdr/agent-bridge/protocol";
    export { connectAgentBridge, imageResult, BRIDGE_PROTOCOL_VERSION };
  `,
  );
  await writeFile(
    config,
    `
    import { readFileSync } from "node:fs";
    export default {
      build: {
        outDir: "bundle",
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: {
          input: "./browser-entry.mjs",
          output: { entryFileNames: "entry.js", chunkFileNames: "chunks/[name].js" },
        },
      },
      plugins: [{
        name: "packed-module-audit",
        generateBundle() {
          const ids = [...this.getModuleIds()].sort();
          this.emitFile({ type: "asset", fileName: "module-audit.json", source: JSON.stringify(ids, null, 2) });
        },
      }],
    };
  `,
  );
  const vite = join(checkoutRoot, "node_modules/.bin/vite");
  const result = spawnSync(vite, ["build", "--config", config], {
    cwd: consumer,
    env: { ...process.env, NODE_PATH: "" },
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `installed browser bundle failed: ${result.stderr}`,
  );
  const bundle = join(consumer, "bundle");
  const audit = JSON.parse(
    await readFile(join(bundle, "module-audit.json"), "utf8"),
  );
  assert.ok(
    audit.some((id) => id.includes("@shdr/agent-bridge")),
    "bundle did not resolve installed package",
  );
  assert.ok(
    !audit.some(
      (id) =>
        id.startsWith(checkoutRoot) ||
        id.includes("/packages/agent-bridge/src/"),
    ),
    "browser bundle followed checkout source",
  );
  const forbiddenIds =
    /(?:@modelcontextprotocol\/sdk|\/server(?:\.|\/)|\/bin(?:\.|\/)|(?:^|\/)ws(?:\.|\/)|^node:|\/node_modules\/node:)/;
  assert.ok(
    !audit.some((id) => forbiddenIds.test(id)),
    `browser module graph includes server-only module: ${audit.join("\n")}`,
  );
  const files = (await import("node:fs/promises")).readdir(bundle, {
    recursive: true,
  });
  const javascript = (await files).filter((name) => name.endsWith(".js"));
  assert.ok(javascript.length > 0, "browser bundle emitted no JavaScript");
  for (const file of javascript) {
    const text = await readFile(join(bundle, file), "utf8");
    assert.ok(
      !/node:(?:fs|http|https|crypto|net|child_process)|@modelcontextprotocol\/sdk|(?:from|require\()\s*["']ws/.test(
        text,
      ),
      `Node/server dependency leaked into ${file}`,
    );
  }
  await writeFile(
    join(tempRoot, "bundle-proof.json"),
    JSON.stringify({ modules: audit.length, javascript }, null, 2),
  );
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), "shdr-agent-bridge-packed-"));
  try {
    const tarball = await packageArtifact(tempRoot);
    const artifact = await inspectArtifact(tarball);
    const consumer = await installConsumer(tempRoot, tarball);
    await checkInstalledExports(consumer.consumer);
    await checkInstalledCli(consumer.consumer);
    await checkBrowserBundle(consumer.consumer, tempRoot);
    await installReactConsumer(consumer.consumer);
    await checkInstalledReactExport(consumer.consumer);
    console.log(
      `packed artifact verified: ${artifact.listing.length} files, isolated consumer, CLI/MCP image, SSR exports, browser boundary`,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await main();
