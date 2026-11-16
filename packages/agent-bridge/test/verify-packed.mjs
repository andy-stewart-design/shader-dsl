import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
  } catch (error) {
    const stderr = error.stderr?.toString();
    throw new Error(
      `${command} ${args.join(" ")} failed${stderr ? `:\n${stderr}` : ""}`,
      { cause: error },
    );
  }
}

function install(consumer, spec) {
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", spec], {
    cwd: consumer,
    env: { ...process.env, NODE_PATH: "", npm_config_ignore_scripts: "true" },
  });
}

function check(consumer, name, source) {
  const path = join(consumer, name);
  writeFileSync(path, source);
  run(process.execPath, [path], {
    cwd: consumer,
    env: { ...process.env, NODE_PATH: "" },
  });
}

function checkExports(consumer) {
  check(
    consumer,
    "check-exports.mjs",
    `
      const root = await import("app-mcp");
      const browser = await import("app-mcp/browser");
      const protocol = await import("app-mcp/protocol");
      const server = await import("app-mcp/server");
      const zod = await import("app-mcp/zod");
      if (typeof root.imageResult !== "function") throw new Error("root export missing");
      if (typeof browser.connectAgentBridge !== "function" || typeof browser.consumePairingLink !== "function" || typeof browser.imageResult !== "function") throw new Error("browser exports missing");
      if (protocol.BRIDGE_PROTOCOL_VERSION !== 1 || protocol.BRIDGE_CATALOG_VERSION !== 1 || protocol.BRIDGE_RESULT_VERSION !== 1 || typeof protocol.LIMITS !== "object") throw new Error("protocol exports missing");
      if (typeof server.startBridgeServer !== "function") throw new Error("server export missing");
      if (typeof zod.defineTool !== "function" || typeof zod.toJsonSchema !== "function" || typeof zod.z?.strictObject !== "function") throw new Error("zod exports missing");
      if (typeof window !== "undefined") throw new Error("SSR check unexpectedly has window");
    `,
  );
}

function checkCli(consumer) {
  const installed = join(consumer, "node_modules/app-mcp");
  const metadata = JSON.parse(
    readFileSync(join(installed, "package.json"), "utf8"),
  );
  assert.equal(metadata.bin?.["app-mcp"], "./dist/bin.mjs");
  const target = join(installed, "dist/bin.mjs");
  assert.ok(existsSync(target), "CLI target is missing");
  const bin = join(
    consumer,
    "node_modules/.bin",
    process.platform === "win32"
      ? "app-mcp.cmd"
      : "app-mcp",
  );
  assert.ok(existsSync(bin), "installed CLI executable is missing");
  if (process.platform !== "win32") {
    assert.ok(statSync(bin).mode & 0o111, "installed CLI is not executable");
    assert.equal(realpathSync(bin), realpathSync(target));
  }
}

function checkReact(consumer) {
  assert.equal(
    existsSync(join(consumer, "node_modules/react")),
    false,
    "optional React peer was installed for the non-React consumer",
  );
  const version = JSON.parse(
    readFileSync(join(packageRoot, "node_modules/react/package.json"), "utf8"),
  ).version;
  assert.match(version, /^\d+(?:\.\d+){2}/);
  install(consumer, `react@${version}`);
  check(
    consumer,
    "check-react.mjs",
    `
      const React = await import("react");
      const adapter = await import("app-mcp/react");
      if (typeof React.createElement !== "function") throw new Error("React SSR import missing");
      if (typeof adapter.AgentBridgeProvider !== "function" || typeof adapter.useAgentBridge !== "function") throw new Error("React exports missing");
      if (typeof window !== "undefined") throw new Error("React SSR check unexpectedly has window");
    `,
  );
}

function main() {
  const tempRoot = mkdtempSync(join(tmpdir(), "app-mcp-packed-"));
  try {
    const pack = JSON.parse(
      run("npm", ["pack", "--pack-destination", tempRoot, "--json"], {
        cwd: packageRoot,
      }),
    )[0];
    const tarball = join(tempRoot, pack.filename);
    assert.ok(existsSync(tarball), "npm pack did not produce a tarball");

    const consumer = join(tempRoot, "consumer");
    mkdirSync(consumer);
    writeFileSync(
      join(consumer, "package.json"),
      JSON.stringify({ private: true, type: "module" }, null, 2),
    );
    install(consumer, tarball);

    const installed = join(consumer, "node_modules/app-mcp");
    assert.ok(
      existsSync(join(installed, "package.json")),
      "tarball package is not installed",
    );
    assert.ok(
      !realpathSync(installed).startsWith(packageRoot),
      "consumer resolved the checkout",
    );
    checkExports(consumer);
    checkCli(consumer);
    checkReact(consumer);
    console.log(
      "packed artifact smoke test passed: exports, optional React peer, and CLI bin",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
