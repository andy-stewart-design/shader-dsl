import { describe, expect, it, afterEach } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

const origin = "https://bridge.example.test";
const clients: Client[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
});

async function start() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "dist/bin.mjs",
      "--allowed-origin",
      origin,
      "--site-url",
      `${origin}/demo`,
    ],
  });
  const client = new Client(
    { name: "bridge-test", version: "1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  clients.push(client);
  return { client };
}

async function wsMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      ws.off("error", onError);
      resolve(JSON.parse(data.toString()));
    };
    const onError = (error: Error) => {
      ws.off("message", onMessage);
      reject(error);
    };
    ws.once("message", onMessage);
    ws.once("error", onError);
  });
}

describe("built stdio and loopback transport", () => {
  it("pairs only after auth and returns a real MCP image block", async () => {
    const { client } = await start();
    const infoCall: any = await client.callTool({
      name: "bridge_get_connection_info",
      arguments: {},
    });
    const info = JSON.parse(infoCall.content[0].text);
    expect(infoCall.isError).not.toBe(true);
    expect(info.pairingUrl).toContain("bridgeToken=");
    expect(info.pairingUrl).not.toContain("?");

    const url = new URL(info.pairingUrl);
    const token = new URLSearchParams(url.hash.slice(1)).get("bridgeToken")!;
    const ws = new WebSocket(`ws://127.0.0.1:${info.port}`, { origin });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.send(JSON.stringify({ type: "auth", token }));
    const auth = await wsMessage(ws);
    expect(auth.type).toBe("auth_ok");
    ws.send(
      JSON.stringify({
        type: "catalog",
        protocolVersion: 1,
        catalogVersion: 1,
        sessionId: auth.sessionId,
        tools: [
          {
            name: "photo",
            description: "return a photo",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      }),
    );
    expect((await wsMessage(ws)).type).toBe("catalog_ok");

    const listed: any = await client.callTool({
      name: "bridge_list_tools",
      arguments: { sessionId: auth.sessionId },
    });
    expect(JSON.parse(listed.content[0].text).tools[0].name).toBe("photo");
    const calledPromise: Promise<any> = client.callTool({
      name: "bridge_call_tool",
      arguments: {
        sessionId: auth.sessionId,
        catalogVersion: 1,
        name: "photo",
        arguments: {},
      },
    });
    const request = await wsMessage(ws);
    expect(request.type).toBe("request");
    ws.send(
      JSON.stringify({
        type: "response",
        requestId: request.requestId,
        ok: true,
        result: {
          bridgeResultVersion: 1,
          content: [
            { type: "text", text: "actual page result" },
            { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
          ],
        },
      }),
    );
    const called: any = await calledPromise;
    expect(called.content).toEqual(
      expect.arrayContaining([
        { type: "text", text: "actual page result" },
        { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
      ]),
    );
    ws.close();
  }, 15_000);

  it("rejects missing and wrong origins before authentication", async () => {
    const { client } = await start();
    const infoCall: any = await client.callTool({
      name: "bridge_get_connection_info",
      arguments: {},
    });
    const info = JSON.parse(infoCall.content[0].text);
    const ws = new WebSocket(`ws://127.0.0.1:${info.port}`, {
      origin: "https://wrong.example.test",
    });
    await expect(
      new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      }),
    ).rejects.toBeDefined();
  }, 15_000);
});
