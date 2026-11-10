#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startBridgeServer } from "./server.js";

function argument(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const args = process.argv.slice(2);
try {
  const allowedOrigin = argument(args, "--allowed-origin");
  const siteUrl = argument(args, "--site-url");
  if (!allowedOrigin || !siteUrl || args.some((arg, index) => arg.startsWith("--") && !["--allowed-origin", "--site-url"].includes(arg) && index >= 0)) {
    throw new Error("usage: shdr-agent-bridge --allowed-origin <HTTPS or localhost origin> --site-url <URL within that origin>");
  }
  if (args.findIndex((arg) => arg === "--allowed-origin") + 1 >= args.length || args.findIndex((arg) => arg === "--site-url") + 1 >= args.length) throw new Error("both bridge flags require values");
  const bridge = await startBridgeServer({ allowedOrigin, siteUrl });
  await bridge.attachMcp(new StdioServerTransport());
} catch (error) {
  process.stderr.write(`shdr-agent-bridge: ${error instanceof Error ? error.message : "startup failed"}\n`);
  process.exitCode = 1;
}
