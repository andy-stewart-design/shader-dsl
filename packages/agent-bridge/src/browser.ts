import { compileInputSchema, validateInput, validateToolName } from "./schema.js";
import { normalizeResult, imageResult as makeImageResult } from "./results.js";
import {
  BRIDGE_CATALOG_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  LIMITS,
  isRecord,
  jsonSize,
  type BridgeConnectionState,
  type BridgeResult,
  type BridgeTool,
  type JsonValue,
} from "./protocol.js";

export type { BridgeConnectionState, BridgeTool } from "./protocol.js";
export { makeImageResult as imageResult };

export type AgentBridge = {
  connect(pairingLink: string): Promise<void>;
  disconnect(): void;
  getState(): BridgeConnectionState;
};

type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
};

const OPEN = 1;

export function consumePairingLink(): string | undefined {
  if (typeof window === "undefined" || !window.location) return undefined;
  const original = window.location.href;
  const url = new URL(original);
  const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  if (!fragment.has("bridgePort") || !fragment.has("bridgeToken")) return undefined;
  fragment.delete("bridgePort");
  fragment.delete("bridgeToken");
  url.hash = fragment.toString();
  window.history.replaceState(null, "", url.href);
  return original;
}

export function connectAgentBridge(options: {
  tools: readonly BridgeTool[];
  onStateChange?: (state: BridgeConnectionState) => void;
}): AgentBridge {
  const tools = [...options.tools];
  const toolMap = new Map<string, BridgeTool>();
  for (const tool of tools) {
    if (!validateToolName(tool.name) || toolMap.has(tool.name)) throw new Error(`invalid or duplicate tool name: ${tool.name}`);
    // Compile at registration time so a bad schema cannot become callable.
    try { compileInputSchema(tool.inputSchema); } catch (error) {
      throw new Error(error instanceof Error ? error.message : "invalid tool input schema");
    }
    toolMap.set(tool.name, tool);
  }
  if (toolMap.size > LIMITS.tools) throw new Error("tool catalog exceeds the limit");

  let state: BridgeConnectionState = { status: "disconnected" };
  let socket: SocketLike | undefined;
  let sessionId: string | undefined;
  const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  const setState = (next: BridgeConnectionState) => {
    state = next;
    options.onStateChange?.(next);
  };
  const failPending = (error: Error) => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  };

  function close(error?: Error, expected = socket) {
    if (socket !== expected) return;
    const current = socket;
    socket = undefined;
    sessionId = undefined;
    failPending(error ?? new Error("bridge disconnected"));
    if (current && current.readyState < 2) current.close();
    if (state.status !== "disconnected") setState(error ? { status: "error", error: { code: "transport", message: error.message } } : { status: "disconnected" });
  }

  async function connect(pairingLink: string): Promise<void> {
    if (state.status === "connected" || state.status === "connecting") throw new Error("bridge is already connected");
    let parsed: { websocketUrl: string; token: string };
    try { parsed = parsePairingLink(pairingLink); }
    catch (error) {
      const reason = error instanceof Error ? error.message : "invalid pairing link";
      setState({ status: "error", error: { code: "pairing", message: reason } });
      throw error;
    }
    setState({ status: "connecting" });
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let next: SocketLike | undefined;
      let authTimer: ReturnType<typeof setTimeout> | undefined;
      const done = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(authTimer);
        if (error) {
          close(error, next);
          reject(error);
        } else resolve();
      };
      try {
        const WebSocketCtor = (globalThis as any).WebSocket;
        if (typeof WebSocketCtor !== "function") throw new Error("WebSocket is unavailable");
        const candidate = new WebSocketCtor(parsed.websocketUrl) as SocketLike;
        next = candidate;
        socket = candidate;
        authTimer = setTimeout(() => done(new Error("authentication timed out")), LIMITS.authenticationTimeoutMs);
        candidate.addEventListener("open", () => {
          if (socket !== candidate) return;
          candidate.send(JSON.stringify({ type: "auth", token: parsed.token }));
        });
        candidate.addEventListener("message", (event: { data: unknown }) => {
          if (socket !== candidate) return;
          let message: any;
          try { message = JSON.parse(typeof event.data === "string" ? event.data : String(event.data)); } catch { done(new Error("malformed bridge message")); return; }
          if (message?.type === "auth_ok" && typeof message.sessionId === "string") {
            sessionId = message.sessionId;
            const catalog = { type: "catalog", protocolVersion: BRIDGE_PROTOCOL_VERSION, catalogVersion: BRIDGE_CATALOG_VERSION, sessionId, tools: tools.map(({ handler: _handler, ...publicTool }) => publicTool) };
            if (jsonSize(catalog) > LIMITS.catalogBytes) { done(new Error("tool catalog exceeds the limit")); return; }
            candidate.send(JSON.stringify(catalog));
            return;
          }
          if (message?.type === "catalog_ok" && message.sessionId === sessionId && message.catalogVersion === BRIDGE_CATALOG_VERSION) {
            setState({ status: "connected", sessionId: sessionId!, catalogVersion: Number(message.catalogVersion) });
            done();
            return;
          }
          if (message?.type === "request") {
            void handleRequest(candidate, message, toolMap);
            return;
          }
          if (message?.type === "response" && typeof message.requestId === "string") {
            const item = pending.get(message.requestId);
            if (!item) return;
            pending.delete(message.requestId);
            clearTimeout(item.timer);
            message.ok ? item.resolve() : item.reject(new Error(message.error?.message || "bridge request failed"));
          }
        });
        candidate.addEventListener("error", () => done(new Error("bridge WebSocket error")));
        candidate.addEventListener("close", () => { if (!settled) done(new Error("bridge WebSocket closed")); else close(undefined, candidate); });
      } catch (error) { done(error instanceof Error ? error : new Error("bridge connection failed")); }
    });
  }

  async function handleRequest(next: SocketLike, message: any, registered: Map<string, BridgeTool>) {
    const respond = (payload: any) => {
      if (socket !== next || next.readyState !== OPEN) return;
      const bounded = jsonSize(payload) > LIMITS.authenticatedFrameBytes
        ? { type: "response", requestId: message.requestId, ok: false, error: { code: "payload_limit", message: "result exceeds payload limit" } }
        : payload;
      next.send(JSON.stringify(bounded));
    };
    if (typeof message.requestId !== "string" || message.sessionId !== sessionId || message.catalogVersion !== BRIDGE_CATALOG_VERSION) {
      respond({ type: "response", requestId: message.requestId, ok: false, error: { code: "stale_session", message: "stale session or catalog" } }); return;
    }
    if (jsonSize(message) > LIMITS.authenticatedFrameBytes) { respond({ type: "response", requestId: message.requestId, ok: false, error: { code: "payload_limit", message: "request exceeds payload limit" } }); return; }
    const tool = registered.get(message.toolName);
    if (!tool) { respond({ type: "response", requestId: message.requestId, ok: false, error: { code: "unknown_tool", message: "unknown tool" } }); return; }
    const validation = validateInput(tool.inputSchema, message.input);
    if (!validation.ok) { respond({ type: "response", requestId: message.requestId, ok: false, error: { code: "invalid_arguments", message: validation.message } }); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIMITS.requestTimeoutMs);
    try {
      const value = await tool.handler(message.input, { signal: controller.signal });
      const result = normalizeResult(value);
      respond({ type: "response", requestId: message.requestId, ok: true, result });
    } catch {
      respond({ type: "response", requestId: message.requestId, ok: false, error: { code: controller.signal.aborted ? "timeout" : "handler_error", message: controller.signal.aborted ? "tool timed out; outcome may be uncertain" : "tool handler failed" } });
    } finally { clearTimeout(timer); }
  }

  return {
    connect,
    disconnect: () => close(),
    getState: () => state,
  };
}

function parsePairingLink(link: string): { websocketUrl: string; token: string } {
  if (typeof window === "undefined") throw new Error("pairing is only available in a browser");
  let url: URL;
  try { url = new URL(link); } catch { throw new Error("invalid pairing link"); }
  const localDevelopment = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.origin !== window.location.origin || (!localDevelopment && url.protocol !== "https:") || url.username || url.password) throw new Error("pairing link origin does not match this HTTPS or localhost page");
  const port = url.hash ? new URLSearchParams(url.hash.slice(1)).get("bridgePort") : null;
  const token = url.hash ? new URLSearchParams(url.hash.slice(1)).get("bridgeToken") : null;
  if (!port || !token || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("pairing link is missing bridge credentials");
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) throw new Error("invalid pairing credential");
  return { websocketUrl: `ws://127.0.0.1:${port}`, token };
}
