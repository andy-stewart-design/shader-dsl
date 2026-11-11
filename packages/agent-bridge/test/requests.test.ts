import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import WebSocket from "ws";
import { connectAgentBridge, type AgentBridge } from "../src/browser.js";
import { startBridgeServer, type BridgeServer } from "../src/server.js";
import { LIMITS, type BridgeTool } from "../src/protocol.js";

const origin = "https://bridge.example.test";
const pageUrl = `${origin}/app`;
const key = "agent-bridge:resume:v1";
const servers: BridgeServer[] = [];
const clients: Client[] = [];
const bridges: AgentBridge[] = [];
const sockets: WebSocket[] = [];
class LocalSocket extends WebSocket {
  constructor(url: string) {
    super(url, { origin });
    sockets.push(this);
  }
}
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      values.set(name, value);
    },
    removeItem: (name: string) => {
      values.delete(name);
    },
  };
}
function page(sessionStorage = storage(), navigation = "navigate") {
  const listeners = new Map<string, Set<() => void>>();
  return {
    sessionStorage,
    location: { origin, href: pageUrl },
    performance: { getEntriesByType: () => [{ type: navigation }] },
    addEventListener(type: string, listener: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) =>
      listeners.get(type)?.delete(listener),
    hide() {
      for (const listener of [...(listeners.get("pagehide") ?? [])]) listener();
    },
  };
}
const tool = (
  name: string,
  handler: BridgeTool["handler"] = () => ({ ready: true }),
): BridgeTool => ({
  name,
  description: name,
  inputSchema: { type: "object", additionalProperties: false },
  handler,
});
const parse = (result: any) => JSON.parse(result.content[0].text);
function browser(window: ReturnType<typeof page>, tools = [tool("read")]) {
  vi.stubGlobal("window", window);
  vi.stubGlobal("WebSocket", LocalSocket);
  const bridge = connectAgentBridge({ tools });
  bridges.push(bridge);
  return bridge;
}
async function server() {
  const helper = await startBridgeServer({
    allowedOrigin: origin,
    siteUrl: pageUrl,
  });
  servers.push(helper);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await helper.attachMcp(serverTransport);
  const client = new Client({ name: "lifecycle-test", version: "1" });
  clients.push(client);
  await client.connect(clientTransport);
  return { helper, client };
}
async function connected(bridge: AgentBridge) {
  await vi.waitFor(() => expect(bridge.getState().status).toBe("connected"), {
    timeout: 2500,
    interval: 10,
  });
  const state = bridge.getState();
  if (state.status !== "connected") throw new Error("not connected");
  return state;
}
async function exchange(socket: WebSocket, message: unknown): Promise<any> {
  const result = new Promise((resolve, reject) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString())));
    socket.once("error", reject);
  });
  socket.send(JSON.stringify(message));
  return result;
}
async function rawSocket(port: number) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}
afterEach(async () => {
  for (const bridge of bridges.splice(0).reverse()) bridge.disconnect();
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const client of clients.splice(0)) await client.close();
  for (const helper of servers.splice(0)) await helper.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("refresh and request lifecycle composition", () => {
  it("resumes a fresh page without a pairing link, rotates credentials, and revokes on explicit disconnect", async () => {
    const { helper, client } = await server();
    const firstPage = page();
    const first = browser(firstPage);
    await first.connect(helper.connectionInfo().pairingUrl!);
    const old = await connected(first);
    const stored = JSON.parse(firstPage.sessionStorage.getItem(key)!);
    expect(stored.resumeToken).toBeTruthy();
    expect(stored).not.toHaveProperty("token");
    firstPage.hide();
    await vi.waitFor(() =>
      expect(helper.connectionInfo().status).toBe("interrupted"),
    );
    const freshPage = page(firstPage.sessionStorage, "reload");
    const fresh = browser(freshPage);
    const next = await connected(fresh);
    expect(next.sessionId).not.toBe(old.sessionId);
    const rotated = JSON.parse(freshPage.sessionStorage.getItem(key)!);
    expect(rotated.resumeToken).not.toBe(stored.resumeToken);
    expect(rotated.pageId).not.toBe(stored.pageId);
    expect(next.catalogVersion).toBe(1);
    const read = await client.callTool({
      name: "bridge_call_tool",
      arguments: {
        sessionId: next.sessionId,
        catalogVersion: 1,
        name: "read",
        arguments: {},
      },
    });
    expect(parse(read)).toEqual({ ready: true });
    const stale = await client.callTool({
      name: "bridge_list_tools",
      arguments: { sessionId: old.sessionId },
    });
    expect(JSON.stringify(stale)).toContain("stale_session");
    const intruder = await rawSocket(helper.port);
    expect(
      await exchange(intruder, {
        type: "resume",
        protocolVersion: 1,
        sessionId: old.sessionId,
        resumeToken: stored.resumeToken,
        pageId: "other",
        pageUrl,
      }),
    ).toMatchObject({ type: "auth_error" });
    fresh.disconnect();
    expect(freshPage.sessionStorage.getItem(key)).toBeNull();
    await vi.waitFor(() =>
      expect(helper.connectionInfo().status).toBe("unpaired"),
    );
    const unpaired = browser(page(freshPage.sessionStorage, "reload"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unpaired.getState().status).toBe("disconnected");
    unpaired.disconnect();
    // The same controller can be paired manually again after an explicit disconnect.
    await fresh.connect(helper.connectionInfo().pairingUrl!);
    expect((await connected(fresh)).sessionId).not.toBe(next.sessionId);
  });

  it("retries a refresh handoff conflict and reconnects a dropped live transport", async () => {
    const { helper } = await server();
    const oldPage = page();
    const old = browser(oldPage);
    await old.connect(helper.connectionInfo().pairingUrl!);
    const before = await connected(old);
    const count = sockets.length;
    const refreshed = browser(page(oldPage.sessionStorage, "reload"));
    await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(count));
    // The helper still owns the old socket, so this first attempt must not steal it.
    expect(helper.connectionInfo().sessionId).toBe(before.sessionId);
    oldPage.hide();
    const resumed = await connected(refreshed);
    expect(resumed.sessionId).not.toBe(before.sessionId);
    const liveSocket = sockets.at(-1)!;
    liveSocket.terminate();
    await vi.waitFor(
      () => {
        const next = refreshed.getState();
        expect(next.status).toBe("connected");
        if (next.status === "connected")
          expect(next.sessionId).not.toBe(resumed.sessionId);
      },
      { timeout: 2500 },
    );
  });

  it("clears invalid resume information and permits fresh manual pairing", async () => {
    const { helper } = await server();
    const sessionStorage = storage();
    sessionStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        origin,
        pageUrl,
        endpoint: `ws://127.0.0.1:${helper.port}`,
        sessionId: "obsolete",
        resumeToken: "invalid",
        pageId: "old",
        resumeLeaseMs: LIMITS.resumeLeaseMs,
      }),
    );
    const bridge = browser(page(sessionStorage, "reload"));
    await vi.waitFor(() => expect(bridge.getState().status).toBe("error"));
    expect(sessionStorage.getItem(key)).toBeNull();
    await bridge.connect(helper.connectionInfo().pairingUrl!);
    expect((await connected(bridge)).status).toBe("connected");
  });

  it("propagates MCP cancellation and ignores a late handler result without replay", async () => {
    const { helper, client } = await server();
    let count = 0;
    let signal: AbortSignal | undefined;
    let complete!: (result: { late: boolean }) => void;
    const bridge = browser(page(), [
      tool("slow", (_input, context) => {
        count++;
        signal = context.signal;
        return new Promise<{ late: boolean }>((resolve) => {
          complete = resolve;
        });
      }),
      tool("read"),
    ]);
    await bridge.connect(helper.connectionInfo().pairingUrl!);
    const state = await connected(bridge);
    const abort = new AbortController();
    const outcome = client
      .callTool(
        {
          name: "bridge_call_tool",
          arguments: {
            sessionId: state.sessionId,
            catalogVersion: 1,
            name: "slow",
            arguments: {},
          },
        },
        CallToolResultSchema,
        { signal: abort.signal },
      )
      .then(
        () => "resolved",
        () => "cancelled",
      );
    await vi.waitFor(() => expect(count).toBe(1));
    abort.abort();
    expect(await outcome).toBe("cancelled");
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    complete({ late: true });
    const read = await client.callTool({
      name: "bridge_call_tool",
      arguments: {
        sessionId: state.sessionId,
        catalogVersion: 1,
        name: "read",
        arguments: {},
      },
    });
    expect(parse(read)).toEqual({ ready: true });
    expect(count).toBe(1);
  });

  it("rejects an interrupted mutation, resumes with a new identity, and never replays it", async () => {
    const { helper, client } = await server();
    let calls = 0;
    let complete!: (result: null) => void;
    const tools = [
      tool("slow", () => {
        calls++;
        return new Promise<null>((resolve) => {
          complete = resolve;
        });
      }),
      tool("read"),
    ];
    const originalPage = page();
    const original = browser(originalPage, tools);
    await original.connect(helper.connectionInfo().pairingUrl!);
    const before = await connected(original);
    const outcome = client.callTool({
      name: "bridge_call_tool",
      arguments: {
        sessionId: before.sessionId,
        catalogVersion: 1,
        name: "slow",
        arguments: {},
      },
    });
    await vi.waitFor(() => expect(calls).toBe(1));
    originalPage.hide();
    expect((await outcome).isError).toBe(true);
    await vi.waitFor(() =>
      expect(helper.connectionInfo().status).toBe("interrupted"),
    );
    const resumed = browser(page(originalPage.sessionStorage, "reload"), tools);
    const next = await connected(resumed);
    complete(null);
    expect(next.sessionId).not.toBe(before.sessionId);
    expect(calls).toBe(1);
    expect(
      parse(
        await client.callTool({
          name: "bridge_call_tool",
          arguments: {
            sessionId: next.sessionId,
            catalogVersion: 1,
            name: "read",
            arguments: {},
          },
        }),
      ),
    ).toEqual({ ready: true });
  });

  it("allows only one helper/controller per page and does not steal ownership", async () => {
    const one = await server();
    const two = await server();
    const window = page();
    const first = browser(window);
    await first.connect(one.helper.connectionInfo().pairingUrl!);
    const second = browser(window);
    await expect(
      second.connect(two.helper.connectionInfo().pairingUrl!),
    ).rejects.toMatchObject({ code: "owner_conflict" });
    expect(two.helper.connectionInfo().status).toBe("unpaired");
    first.disconnect();
    await second.connect(two.helper.connectionInfo().pairingUrl!);
    expect((await connected(second)).status).toBe("connected");
  });

  it("expires authority from transport loss and rejects credentials at a fresh helper", async () => {
    const { helper } = await server();
    const link = new URL(helper.connectionInfo().pairingUrl!);
    const socket = await rawSocket(helper.port);
    const grant = await exchange(socket, {
      type: "auth",
      token: new URLSearchParams(link.hash.slice(1)).get("bridgeToken"),
      resumable: true,
      pageId: "page",
      pageUrl,
    });
    const closed = new Promise<void>((resolve) =>
      socket.once("close", () => resolve()),
    );
    socket.close();
    await closed;
    await vi.waitFor(() =>
      expect(helper.connectionInfo().status).toBe("interrupted"),
    );
    const time = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.now() + LIMITS.resumeLeaseMs + 10);
    expect(helper.connectionInfo().status).toBe("unpaired");
    time.mockRestore();
    const expired = await rawSocket(helper.port);
    const message = {
      type: "resume",
      protocolVersion: 1,
      sessionId: grant.sessionId,
      resumeToken: grant.resumeToken,
      pageId: "fresh",
      pageUrl,
    };
    expect(await exchange(expired, message)).toMatchObject({
      type: "auth_error",
      error: { code: "invalid_resume" },
    });
    const restarted = await server();
    const other = await rawSocket(restarted.helper.port);
    expect(await exchange(other, message)).toMatchObject({
      type: "auth_error",
      error: { code: "invalid_resume" },
    });
    expect(restarted.helper.connectionInfo().pairingUrl).toBeTruthy();
  });
});
