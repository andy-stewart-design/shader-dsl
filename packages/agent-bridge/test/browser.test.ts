import { afterEach, describe, expect, it } from "vitest";
import { connectAgentBridge, consumePairingLink } from "../src/browser.js";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  private listeners = new Map<string, ((event: any) => void)[]>();
  sent: string[] = [];
  protocolVersion = 1;
  deferCatalogAck = false;
  constructor(public readonly url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, listener: (event: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(data: string) {
    this.sent.push(data);
    const message = JSON.parse(data);
    if (message.type === "auth")
      this.emit("message", {
        data: JSON.stringify({
          type: "auth_ok",
          protocolVersion: this.protocolVersion,
          sessionId: "session-a",
        }),
      });
    if (message.type === "catalog" && !this.deferCatalogAck)
      this.emit("message", {
        data: JSON.stringify({
          type: "catalog_ok",
          protocolVersion: this.protocolVersion,
          sessionId: "session-a",
          catalogVersion: message.catalogVersion,
        }),
      });
  }
  acknowledgeCatalog(catalogVersion: number) {
    this.emit("message", {
      data: JSON.stringify({
        type: "catalog_ok",
        protocolVersion: this.protocolVersion,
        sessionId: "session-a",
        catalogVersion,
      }),
    });
  }
  close() {
    this.readyState = 3;
    this.emit("close", {});
  }
  emit(type: string, event: any) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  open() {
    this.readyState = 1;
    this.emit("open", {});
  }
}

const originalWindow = (globalThis as any).window;
const originalWebSocket = (globalThis as any).WebSocket;
afterEach(() => {
  (globalThis as any).window = originalWindow;
  (globalThis as any).WebSocket = originalWebSocket;
  FakeSocket.instances = [];
});

function makeTool(
  name: string,
  inputSchema: any = { type: "object", additionalProperties: false },
  handler: (input: unknown, context: { signal: AbortSignal }) => any = () => ({
    ok: true,
  }),
) {
  return { name, description: name, inputSchema, handler };
}

describe("browser entrypoint", () => {
  it("consumes credentials immediately and pairing does not invoke tools", async () => {
    const page = {
      href: "https://bridge.example.test/app#keep=1&bridgePort=1234&bridgeToken=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
      origin: "https://bridge.example.test",
    };
    let replaced = "";
    (globalThis as any).window = {
      location: page,
      history: {
        replaceState: (_a: unknown, _b: string, value: string) => {
          replaced = value;
        },
      },
    };
    const link = consumePairingLink();
    expect(link).toBe(page.href);
    expect(replaced).toBe("https://bridge.example.test/app#keep=1");

    (globalThis as any).WebSocket = FakeSocket;
    let invocations = 0;
    const bridge = connectAgentBridge({
      tools: [
        {
          name: "read",
          description: "read",
          inputSchema: { type: "object", additionalProperties: false },
          handler: () => {
            invocations++;
            return { ok: true };
          },
        },
      ],
    });
    const connection = bridge.connect(link!);
    FakeSocket.instances[0]!.open();
    await connection;
    expect(invocations).toBe(0);
    expect(bridge.getState()).toMatchObject({
      status: "connected",
      sessionId: "session-a",
    });
  });

  it("atomically replaces tools after the acknowledged catalog version", async () => {
    (globalThis as any).window = {
      location: {
        href: "https://bridge.example.test/",
        origin: "https://bridge.example.test",
      },
      history: {},
    };
    (globalThis as any).WebSocket = FakeSocket;
    const bridge = connectAgentBridge({ tools: [makeTool("old")] });
    const connection = bridge.connect(
      "https://bridge.example.test/#bridgePort=1&bridgeToken=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
    );
    FakeSocket.instances[0]!.open();
    await connection;
    const socket = FakeSocket.instances[0]!;
    socket.deferCatalogAck = true;
    const replacement = bridge.updateTools([makeTool("new")]);
    await Promise.resolve();
    expect(bridge.getState()).toMatchObject({ catalogVersion: 1 });
    socket.acknowledgeCatalog(2);
    await replacement;
    expect(bridge.getState()).toMatchObject({
      status: "connected",
      catalogVersion: 2,
    });
    const catalog = JSON.parse(socket.sent.at(-1)!);
    expect(catalog.catalogVersion).toBe(2);
    expect(catalog.tools.map((item: any) => item.name)).toEqual(["new"]);
  });

  it("distinguishes stale, unknown, and invalid requests without invoking a handler", async () => {
    (globalThis as any).window = {
      location: {
        href: "https://bridge.example.test/",
        origin: "https://bridge.example.test",
      },
      history: {},
    };
    (globalThis as any).WebSocket = FakeSocket;
    let invocations = 0;
    const bridge = connectAgentBridge({
      tools: [
        makeTool(
          "read",
          {
            type: "object",
            properties: {
              nested: {
                type: "object",
                required: ["value"],
                properties: { value: { type: "string" } },
                additionalProperties: false,
              },
            },
            required: ["nested"],
            additionalProperties: false,
          },
          () => {
            invocations++;
            return { ok: true };
          },
        ),
      ],
    });
    const connection = bridge.connect(
      "https://bridge.example.test/#bridgePort=1&bridgeToken=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
    );
    FakeSocket.instances[0]!.open();
    await connection;
    const socket = FakeSocket.instances[0]!;
    const response = async (request: any) => {
      const before = socket.sent.length;
      socket.emit("message", { data: JSON.stringify(request) });
      await Promise.resolve();
      await Promise.resolve();
      return JSON.parse(socket.sent.slice(before).at(-1)!);
    };
    expect(
      (
        await response({
          type: "request",
          requestId: "1",
          sessionId: "other",
          catalogVersion: 1,
          toolName: "read",
          input: { nested: { value: "ok" } },
        })
      ).error.code,
    ).toBe("stale_session");
    expect(
      (
        await response({
          type: "request",
          requestId: "2",
          sessionId: "session-a",
          catalogVersion: 2,
          toolName: "read",
          input: { nested: { value: "ok" } },
        })
      ).error.code,
    ).toBe("stale_catalog");
    expect(
      (
        await response({
          type: "request",
          requestId: "3",
          sessionId: "session-a",
          catalogVersion: 1,
          toolName: "missing",
          input: { nested: { value: "ok" } },
        })
      ).error.code,
    ).toBe("unknown_tool");
    expect(
      (
        await response({
          type: "request",
          requestId: "4",
          sessionId: "session-a",
          catalogVersion: 1,
          toolName: "read",
          input: { nested: {} },
        })
      ).error.code,
    ).toBe("invalid_arguments");
    expect(invocations).toBe(0);

    socket.deferCatalogAck = true;
    const update = bridge.updateTools([makeTool("replacement")]);
    await Promise.resolve();
    socket.acknowledgeCatalog(2);
    await update;
    expect(
      (
        await response({
          type: "request",
          requestId: "5",
          sessionId: "session-a",
          catalogVersion: 1,
          toolName: "read",
          input: { nested: { value: "ok" } },
        })
      ).error.code,
    ).toBe("stale_catalog");
    expect(invocations).toBe(0);
  });

  it("fails a handshake with an unsupported protocol version", async () => {
    (globalThis as any).window = {
      location: {
        href: "https://bridge.example.test/",
        origin: "https://bridge.example.test",
      },
      history: {},
    };
    (globalThis as any).WebSocket = FakeSocket;
    const bridge = connectAgentBridge({ tools: [] });
    const connection = bridge.connect(
      "https://bridge.example.test/#bridgePort=1&bridgeToken=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
    );
    FakeSocket.instances[0]!.protocolVersion = 2;
    FakeSocket.instances[0]!.open();
    await expect(connection).rejects.toMatchObject({
      code: "unsupported_protocol",
    });
  });

  it("rejects host injection and non-HTTPS origins before opening a socket", async () => {
    (globalThis as any).window = {
      location: {
        href: "https://bridge.example.test/",
        origin: "https://bridge.example.test",
      },
      history: {},
    };
    (globalThis as any).WebSocket = FakeSocket;
    const bridge = connectAgentBridge({ tools: [] });
    await expect(
      bridge.connect(
        "https://evil.example/#bridgePort=1&bridgeToken=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
      ),
    ).rejects.toThrow();
    await expect(
      bridge.connect(
        "http://bridge.example.test/#bridgePort=1&bridgeToken=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
      ),
    ).rejects.toThrow();
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it("dispatches the replacement handler and preserves it after an invalid update", async () => {
    (globalThis as any).window = {
      location: { origin: "https://bridge.example.test" },
    };
    (globalThis as any).WebSocket = FakeSocket;
    const bridge = connectAgentBridge({ tools: [makeTool("old")] });
    const connected = bridge.connect(
      "https://bridge.example.test/#bridgePort=1&bridgeToken=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
    );
    const socket = FakeSocket.instances[0]!;
    socket.open();
    await connected;
    const replacement = makeTool(
      "new",
      { type: "object", additionalProperties: false },
      () => ({ fresh: true }),
    );
    await bridge.updateTools([replacement]);
    const sent = socket.sent.length;
    await expect(
      bridge.updateTools([replacement, replacement]),
    ).rejects.toThrow();
    expect(socket.sent).toHaveLength(sent);
    expect(bridge.getState()).toMatchObject({ catalogVersion: 2 });
    socket.emit("message", {
      data: JSON.stringify({
        type: "request",
        requestId: "fresh",
        sessionId: "session-a",
        catalogVersion: 2,
        toolName: "new",
        input: {},
      }),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({
      requestId: "fresh",
      ok: true,
      result: { content: [{ type: "text", text: '{"fresh":true}' }] },
    });
    bridge.disconnect();
  });
});
