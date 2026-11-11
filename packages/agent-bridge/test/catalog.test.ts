import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

const origin = "https://bridge.example.test";
const clients: Client[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  for (const client of clients.splice(0)) await client.close();
});

const tool = (name: string) => ({
  name,
  description: name,
  inputSchema: {
    type: "object",
    properties: {
      nested: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      },
    },
    required: ["nested"],
    additionalProperties: false,
  },
});
const validInput = { nested: { value: "ok" } };
const nextMessage = (socket: WebSocket): Promise<any> =>
  new Promise((resolve, reject) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString())));
    socket.once("error", reject);
  });
const data = (result: any) => JSON.parse(result.content[0].text);

async function start() {
  const client = new Client({ name: "catalog-test", version: "1" });
  clients.push(client);
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["dist/bin.mjs", "--allowed-origin", origin, "--site-url", origin],
    }),
  );
  const info = data(
    await client.callTool({
      name: "bridge_get_connection_info",
      arguments: {},
    }),
  );
  const pairing = new URL(info.pairingUrl);
  const socket = new WebSocket(`ws://127.0.0.1:${info.port}`, { origin });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const exchange = async (message: unknown) => {
    const reply = nextMessage(socket);
    socket.send(JSON.stringify(message));
    return reply;
  };
  const auth = await exchange({
    type: "auth",
    token: new URLSearchParams(pairing.hash.slice(1)).get("bridgeToken"),
  });
  const catalog = (version: number, tools: unknown[]) =>
    exchange({
      type: "catalog",
      protocolVersion: 1,
      sessionId: auth.sessionId,
      catalogVersion: version,
      tools,
    });
  const call = (name: string, args: object = {}) =>
    client.callTool({
      name,
      arguments: { sessionId: auth.sessionId, ...args },
    });
  return { client, socket, catalog, call, sessionId: auth.sessionId };
}

describe("catalog replacement through the built MCP helper", () => {
  it("publishes only validated replacements and rejects stale/removed/invalid calls without dispatch", async () => {
    const { socket, catalog, call, sessionId } = await start();
    expect(await catalog(1, [tool("old")])).toMatchObject({
      type: "catalog_ok",
      protocolVersion: 1,
      catalogVersion: 1,
    });
    let dispatched = 0;
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== "request") return;
      dispatched++;
      socket.send(
        JSON.stringify({
          type: "response",
          requestId: message.requestId,
          ok: false,
          error: {
            code: "handler_error",
            message: "DO_NOT_EXPOSE_PAIRING_SECRET",
          },
        }),
      );
    });
    expect(await catalog(2, [tool("new")])).toMatchObject({
      type: "catalog_ok",
      catalogVersion: 2,
    });
    expect(data(await call("bridge_list_tools"))).toMatchObject({
      sessionId,
      catalogVersion: 2,
      tools: [{ name: "new" }],
    });
    expect(
      data(await call("bridge_describe_tool", { name: "new" })),
    ).toMatchObject({ name: "new", catalogVersion: 2 });
    for (const [args, code] of [
      [
        { catalogVersion: 1, name: "old", arguments: validInput },
        "stale_catalog",
      ],
      [
        { catalogVersion: 2, name: "old", arguments: validInput },
        "unknown_tool",
      ],
      [
        { catalogVersion: 2, name: "new", arguments: { nested: {} } },
        "invalid_arguments",
      ],
      [
        {
          sessionId: "wrong",
          catalogVersion: 2,
          name: "new",
          arguments: validInput,
        },
        "stale_session",
      ],
    ] as const) {
      const result = await call("bridge_call_tool", args);
      expect(result.isError).toBe(true);
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            text: expect.stringContaining(code),
          }),
        ]),
      );
    }
    expect(dispatched).toBe(0);
    expect(
      await catalog(3, [tool("duplicate"), tool("duplicate")]),
    ).toMatchObject({ type: "catalog_error" });
    expect(data(await call("bridge_list_tools")).catalogVersion).toBe(2);
    const failed = await call("bridge_call_tool", {
      catalogVersion: 2,
      name: "new",
      arguments: validInput,
    });
    expect(failed.isError).toBe(true);
    expect(JSON.stringify(failed)).toContain("handler_error");
    expect(JSON.stringify(failed)).not.toContain(
      "DO_NOT_EXPOSE_PAIRING_SECRET",
    );
    expect(dispatched).toBe(1);
  }, 15_000);

  it("invalidates in-flight work when a catalog is replaced", async () => {
    const { socket, catalog, call } = await start();
    await catalog(1, [tool("old")]);
    const requestSeen = nextMessage(socket);
    const result = call("bridge_call_tool", {
      catalogVersion: 1,
      name: "old",
      arguments: validInput,
    });
    const oldRequest = await requestSeen;
    expect(oldRequest.type).toBe("request");
    await catalog(2, [tool("new")]);
    expect(JSON.stringify(await result)).toContain("stale_catalog");
    socket.send(
      JSON.stringify({
        type: "response",
        requestId: oldRequest.requestId,
        ok: true,
        result: {
          bridgeResultVersion: 1,
          content: [{ type: "text", text: "late result" }],
        },
      }),
    );
    expect(data(await call("bridge_list_tools")).catalogVersion).toBe(2);
  }, 15_000);
});
