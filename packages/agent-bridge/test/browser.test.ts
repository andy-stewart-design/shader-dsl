import { afterEach, describe, expect, it } from "vitest";
import { connectAgentBridge, consumePairingLink } from "../src/browser.js";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  private listeners = new Map<string, ((event: any) => void)[]>();
  sent: string[] = [];
  constructor(public readonly url: string) { FakeSocket.instances.push(this); }
  addEventListener(type: string, listener: (event: any) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  send(data: string) {
    this.sent.push(data);
    const message = JSON.parse(data);
    if (message.type === "auth") this.emit("message", { data: JSON.stringify({ type: "auth_ok", sessionId: "session-a" }) });
    if (message.type === "catalog") this.emit("message", { data: JSON.stringify({ type: "catalog_ok", sessionId: "session-a", catalogVersion: 1 }) });
  }
  close() { this.readyState = 3; this.emit("close", {}); }
  emit(type: string, event: any) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  open() { this.readyState = 1; this.emit("open", {}); }
}

const originalWindow = (globalThis as any).window;
const originalWebSocket = (globalThis as any).WebSocket;
afterEach(() => {
  (globalThis as any).window = originalWindow;
  (globalThis as any).WebSocket = originalWebSocket;
  FakeSocket.instances = [];
});

describe("browser entrypoint", () => {
  it("consumes credentials immediately and pairing does not invoke tools", async () => {
    const page = { href: "https://bridge.example.test/app#keep=1&bridgePort=1234&bridgeToken=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_", origin: "https://bridge.example.test" };
    let replaced = "";
    (globalThis as any).window = { location: page, history: { replaceState: (_a: unknown, _b: string, value: string) => { replaced = value; } } };
    const link = consumePairingLink();
    expect(link).toBe(page.href);
    expect(replaced).toBe("https://bridge.example.test/app#keep=1");

    (globalThis as any).WebSocket = FakeSocket;
    let invocations = 0;
    const bridge = connectAgentBridge({ tools: [{ name: "read", description: "read", inputSchema: { type: "object", additionalProperties: false }, handler: () => { invocations++; return { ok: true }; } }] });
    const connection = bridge.connect(link!);
    FakeSocket.instances[0]!.open();
    await connection;
    expect(invocations).toBe(0);
    expect(bridge.getState()).toMatchObject({ status: "connected", sessionId: "session-a" });
  });

  it("rejects host injection and non-HTTPS origins before opening a socket", async () => {
    (globalThis as any).window = { location: { href: "https://bridge.example.test/", origin: "https://bridge.example.test" }, history: {} };
    (globalThis as any).WebSocket = FakeSocket;
    const bridge = connectAgentBridge({ tools: [] });
    await expect(bridge.connect("https://evil.example/#bridgePort=1&bridgeToken=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" )).rejects.toThrow();
    await expect(bridge.connect("http://bridge.example.test/#bridgePort=1&bridgeToken=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" )).rejects.toThrow();
    expect(FakeSocket.instances).toHaveLength(0);
  });
});
