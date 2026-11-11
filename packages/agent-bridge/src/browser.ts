import {
  validateCatalogTools,
  validateInput,
  validateToolName,
} from "./schema.js";
import {
  BridgeResultError,
  normalizeResult,
  imageResult as makeImageResult,
} from "./results.js";
import {
  BRIDGE_CATALOG_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  LIMITS,
  isJsonValue,
  isRecord,
  jsonSize,
  wireByteLength,
  type BridgeConnectionState,
  type BridgeResult,
  type BridgeTool,
  type CatalogTool,
} from "./protocol.js";

export type { BridgeConnectionState, BridgeTool } from "./protocol.js";
export { makeImageResult as imageResult };

export type AgentBridge = {
  connect(pairingLink: string): Promise<void>;
  disconnect(): void;
  getState(): BridgeConnectionState;
  /** Atomically replace the page catalog after the helper acknowledges it. */
  updateTools(tools: readonly BridgeTool[]): Promise<void>;
};

type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
};

const OPEN = 1;

class BridgeClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BridgeClientError";
  }
}

export function consumePairingLink(): string | undefined {
  if (typeof window === "undefined" || !window.location) return undefined;
  const original = window.location.href;
  const url = new URL(original);
  const fragment = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );
  if (!fragment.has("bridgePort") || !fragment.has("bridgeToken"))
    return undefined;
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
  validateCatalogTools(
    options.tools.map(({ handler: _handler, ...tool }) => tool),
  );
  let currentTools = [...options.tools];
  const toolMap = new Map<string, BridgeTool>(
    currentTools.map((tool) => [tool.name, tool]),
  );

  let state: BridgeConnectionState = { status: "disconnected" };
  let socket: SocketLike | undefined;
  let sessionId: string | undefined;
  let catalogVersion: number = BRIDGE_CATALOG_VERSION;
  let pendingCatalog:
    | {
        version: number;
        timer: ReturnType<typeof setTimeout>;
        tools: readonly BridgeTool[];
        resolve: () => void;
        reject: (error: Error) => void;
      }
    | undefined;
  const pending = new Map<
    string,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const setState = (next: BridgeConnectionState) => {
    state = next;
    try {
      options.onStateChange?.(next);
    } catch {
      // State observers are application code and must not break the transport.
    }
  };
  const failPending = (error: Error) => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
    if (pendingCatalog) {
      clearTimeout(pendingCatalog.timer);
      pendingCatalog.reject(error);
      pendingCatalog = undefined;
    }
  };

  function close(error?: Error, expected = socket) {
    if (socket !== expected) return;
    const current = socket;
    socket = undefined;
    sessionId = undefined;
    failPending(
      error ?? new BridgeClientError("not_connected", "bridge disconnected"),
    );
    if (current && current.readyState < 2) current.close();
    if (state.status !== "disconnected")
      setState(
        error
          ? {
              status: "error",
              error: { code: errorCode(error), message: error.message },
            }
          : { status: "disconnected" },
      );
  }

  async function connect(pairingLink: string): Promise<void> {
    if (state.status === "connected" || state.status === "connecting")
      throw new Error("bridge is already connected");
    let parsed: { websocketUrl: string; token: string };
    try {
      parsed = parsePairingLink(pairingLink);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "invalid pairing link";
      setState({
        status: "error",
        error: { code: "invalid_message", message: reason },
      });
      throw error;
    }
    setState({ status: "connecting" });
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let next: SocketLike | undefined;
      let authTimer: ReturnType<typeof setTimeout> | undefined;
      const done = (error?: Error) => {
        if (settled) {
          if (error) close(error, next);
          return;
        }
        settled = true;
        clearTimeout(authTimer);
        if (error) {
          close(error, next);
          reject(error);
        } else resolve();
      };
      try {
        const WebSocketCtor = (globalThis as any).WebSocket;
        if (typeof WebSocketCtor !== "function")
          throw new Error("WebSocket is unavailable");
        const candidate = new WebSocketCtor(parsed.websocketUrl) as SocketLike;
        next = candidate;
        socket = candidate;
        authTimer = setTimeout(
          () =>
            done(new BridgeClientError("timeout", "authentication timed out")),
          LIMITS.authenticationTimeoutMs,
        );
        candidate.addEventListener("open", () => {
          if (socket !== candidate) return;
          try {
            candidate.send(
              JSON.stringify({ type: "auth", token: parsed.token }),
            );
          } catch {
            done(
              new BridgeClientError(
                "not_connected",
                "authentication send failed",
              ),
            );
          }
        });
        candidate.addEventListener("message", (event: { data: unknown }) => {
          if (socket !== candidate) return;
          let message: any;
          try {
            if (wireByteLength(event.data) > LIMITS.authenticatedFrameBytes) {
              done(
                new BridgeClientError(
                  "payload_limit",
                  "message exceeds payload limit",
                ),
              );
              return;
            }
            message = parseEventData(event.data);
          } catch {
            done(
              new BridgeClientError(
                "invalid_message",
                "malformed bridge message",
              ),
            );
            return;
          }
          if (!isRecord(message) || typeof message.type !== "string") {
            done(
              new BridgeClientError(
                "invalid_message",
                "malformed bridge message",
              ),
            );
            return;
          }
          if (message.type === "auth_ok") {
            if (state.status !== "connecting" || sessionId !== undefined) {
              done(
                new BridgeClientError(
                  "invalid_message",
                  "unexpected authentication acknowledgement",
                ),
              );
              return;
            }
            if (
              message.protocolVersion !== BRIDGE_PROTOCOL_VERSION ||
              typeof message.sessionId !== "string" ||
              message.sessionId.length === 0
            ) {
              done(
                new BridgeClientError(
                  "unsupported_protocol",
                  "unsupported bridge protocol",
                ),
              );
              return;
            }
            sessionId = message.sessionId;
            const catalog = makeCatalog(
              currentTools,
              sessionId,
              BRIDGE_CATALOG_VERSION,
            );
            if (jsonSize(catalog) > LIMITS.catalogBytes) {
              done(
                new BridgeClientError(
                  "payload_limit",
                  "tool catalog exceeds the limit",
                ),
              );
              return;
            }
            try {
              candidate.send(JSON.stringify(catalog));
            } catch {
              done(
                new BridgeClientError("not_connected", "catalog send failed"),
              );
            }
            return;
          }
          if (message.type === "catalog_ok") {
            if (
              message.protocolVersion !== BRIDGE_PROTOCOL_VERSION ||
              message.sessionId !== sessionId ||
              !Number.isSafeInteger(message.catalogVersion)
            ) {
              done(
                new BridgeClientError(
                  "invalid_message",
                  "malformed catalog acknowledgement",
                ),
              );
              return;
            }
            if (!pendingCatalog) {
              if (
                state.status !== "connecting" ||
                message.catalogVersion !== BRIDGE_CATALOG_VERSION
              ) {
                done(
                  new BridgeClientError(
                    "stale_catalog",
                    "unexpected catalog version",
                  ),
                );
                return;
              }
              catalogVersion = message.catalogVersion;
              setState({
                status: "connected",
                sessionId: sessionId!,
                catalogVersion,
              });
              done();
              return;
            }
            if (message.catalogVersion !== pendingCatalog.version) {
              const request = pendingCatalog;
              pendingCatalog = undefined;
              clearTimeout(request.timer);
              request.reject(
                new BridgeClientError(
                  "stale_catalog",
                  "catalog acknowledgement is stale",
                ),
              );
              return;
            }
            const request = pendingCatalog;
            pendingCatalog = undefined;
            clearTimeout(request.timer);
            currentTools = [...request.tools];
            toolMap.clear();
            for (const tool of request.tools) toolMap.set(tool.name, tool);
            catalogVersion = request.version;
            setState({
              status: "connected",
              sessionId: sessionId!,
              catalogVersion,
            });
            request.resolve();
            return;
          }
          if (message.type === "catalog_error") {
            if (
              message.protocolVersion !== BRIDGE_PROTOCOL_VERSION ||
              message.sessionId !== sessionId ||
              !isWireError(message.error)
            ) {
              done(
                new BridgeClientError(
                  "invalid_message",
                  "malformed catalog error",
                ),
              );
              return;
            }
            if (
              pendingCatalog &&
              message.catalogVersion === pendingCatalog.version
            ) {
              const request = pendingCatalog;
              pendingCatalog = undefined;
              clearTimeout(request.timer);
              request.reject(
                new BridgeClientError(
                  message.error.code,
                  "catalog update rejected",
                ),
              );
            }
            return;
          }
          if (message.type === "request") {
            void handleRequest(candidate, message, toolMap);
            return;
          }
          if (
            message.type === "response" &&
            typeof message.requestId === "string"
          ) {
            handleResponse(message);
            return;
          }
          done(
            new BridgeClientError(
              "invalid_message",
              "unexpected bridge message",
            ),
          );
        });
        candidate.addEventListener("error", () =>
          done(
            new BridgeClientError("not_connected", "bridge WebSocket error"),
          ),
        );
        candidate.addEventListener("close", () => {
          if (!settled)
            done(
              new BridgeClientError("not_connected", "bridge WebSocket closed"),
            );
          else close(undefined, candidate);
        });
      } catch (error) {
        done(
          error instanceof Error
            ? error
            : new Error("bridge connection failed"),
        );
      }
    });
  }

  async function updateTools(tools: readonly BridgeTool[]): Promise<void> {
    const publicTools = tools.map(({ handler: _handler, ...tool }) => tool);
    // This is deliberately before any socket/state mutation.
    validateCatalogTools(publicTools);
    const nextVersion = catalogVersion + 1;
    if (!socket || !sessionId || state.status !== "connected")
      throw new BridgeClientError("not_connected", "no authenticated bridge");
    if (pendingCatalog)
      throw new BridgeClientError(
        "invalid_message",
        "a catalog update is already pending",
      );
    const catalog = makeCatalog(tools, sessionId, nextVersion);
    if (jsonSize(catalog) > LIMITS.catalogBytes)
      throw new BridgeClientError(
        "payload_limit",
        "tool catalog exceeds the limit",
      );
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pendingCatalog?.version !== nextVersion) return;
        const error = new BridgeClientError(
          "timeout",
          "catalog update timed out; reconnect to rediscover tools",
        );
        close(error);
      }, LIMITS.requestTimeoutMs);
      pendingCatalog = {
        version: nextVersion,
        timer,
        tools: [...tools],
        resolve,
        reject,
      };
      try {
        socket!.send(JSON.stringify(catalog));
      } catch {
        const request = pendingCatalog;
        pendingCatalog = undefined;
        clearTimeout(request.timer);
        request.reject(
          new BridgeClientError("not_connected", "catalog send failed"),
        );
      }
    });
  }

  async function handleRequest(
    next: SocketLike,
    message: any,
    registered: Map<string, BridgeTool>,
  ) {
    const requestId =
      isRecord(message) && typeof message.requestId === "string"
        ? message.requestId
        : undefined;
    const respond = (payload: Record<string, unknown>) => {
      if (!requestId || socket !== next || next.readyState !== OPEN) return;
      let bounded: Record<string, unknown> = payload;
      try {
        if (jsonSize(payload) > LIMITS.authenticatedFrameBytes) {
          bounded = {
            type: "response",
            requestId,
            ok: false,
            error: {
              code: "payload_limit",
              message: "result exceeds payload limit",
            },
          };
        }
        next.send(JSON.stringify(bounded));
      } catch {
        // A malformed callback result cannot crash the page event loop.
      }
    };
    if (
      !isRecord(message) ||
      message.type !== "request" ||
      !requestId ||
      typeof message.sessionId !== "string" ||
      !Number.isSafeInteger(message.catalogVersion) ||
      typeof message.toolName !== "string" ||
      !isJsonValue(message.input)
    ) {
      respond({
        type: "response",
        requestId: requestId ?? "invalid",
        ok: false,
        error: { code: "invalid_message", message: "malformed tool request" },
      });
      return;
    }
    if (message.sessionId !== sessionId) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: { code: "stale_session", message: "stale session" },
      });
      return;
    }
    if (message.catalogVersion !== catalogVersion) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: { code: "stale_catalog", message: "stale catalog" },
      });
      return;
    }
    if (jsonSize(message) > LIMITS.authenticatedFrameBytes) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: {
          code: "payload_limit",
          message: "request exceeds payload limit",
        },
      });
      return;
    }
    const tool = registered.get(message.toolName);
    if (!tool) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: { code: "unknown_tool", message: "unknown tool" },
      });
      return;
    }
    const validation = validateInput(tool.inputSchema, message.input);
    if (!validation.ok) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: { code: "invalid_arguments", message: validation.message },
      });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIMITS.requestTimeoutMs);
    try {
      let value: unknown;
      try {
        value = await tool.handler(message.input, {
          signal: controller.signal,
        });
      } catch {
        respond({
          type: "response",
          requestId,
          ok: false,
          error: {
            code: controller.signal.aborted ? "timeout" : "handler_error",
            message: controller.signal.aborted
              ? "tool timed out; outcome may be uncertain"
              : "tool handler failed",
          },
        });
        return;
      }
      let result: BridgeResult;
      try {
        result = normalizeResult(value);
      } catch (error) {
        const code =
          error instanceof BridgeResultError ? error.code : "invalid_message";
        respond({
          type: "response",
          requestId,
          ok: false,
          error: {
            code,
            message:
              code === "payload_limit"
                ? "tool result exceeds the payload limit"
                : "tool returned an invalid result",
          },
        });
        return;
      }
      respond({ type: "response", requestId, ok: true, result });
    } finally {
      clearTimeout(timer);
    }
  }

  function handleResponse(message: any) {
    const call = pending.get(message.requestId);
    if (!call) return;
    pending.delete(message.requestId);
    clearTimeout(call.timer);
    if (!isRecord(message) || typeof message.ok !== "boolean") {
      call.reject(
        new BridgeClientError("invalid_message", "malformed tool response"),
      );
      return;
    }
    if (message.ok) {
      try {
        if (!normalizeResult(message.result)) throw new Error("invalid result");
        call.resolve();
      } catch {
        call.reject(
          new BridgeClientError(
            "invalid_message",
            "page returned an invalid result",
          ),
        );
      }
      return;
    }
    if (!isWireError(message.error)) {
      call.reject(
        new BridgeClientError("invalid_message", "malformed tool error"),
      );
      return;
    }
    call.reject(
      new BridgeClientError(message.error.code, message.error.message),
    );
  }

  return {
    connect,
    disconnect: () => close(),
    getState: () => state,
    updateTools,
  };
}

function makeCatalog(
  tools: readonly BridgeTool[],
  sessionId: string,
  catalogVersion: number,
) {
  return {
    type: "catalog" as const,
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    catalogVersion,
    sessionId,
    tools: tools.map(({ handler: _handler, ...publicTool }) => publicTool),
  };
}

function isWireError(
  value: unknown,
): value is { code: string; message: string } {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    value.code.length <= 64 &&
    value.message.length <= 512
  );
}

function errorCode(error: Error): string {
  return error instanceof BridgeClientError ? error.code : "not_connected";
}

function parseEventData(data: unknown): unknown {
  if (typeof data === "string") return JSON.parse(data);
  if (data instanceof ArrayBuffer)
    return JSON.parse(new TextDecoder().decode(data));
  if (ArrayBuffer.isView(data))
    return JSON.parse(new TextDecoder().decode(data));
  return JSON.parse(String(data));
}

function parsePairingLink(link: string): {
  websocketUrl: string;
  token: string;
} {
  if (typeof window === "undefined")
    throw new Error("pairing is only available in a browser");
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("invalid pairing link");
  }
  const localDevelopment =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    url.origin !== window.location.origin ||
    (!localDevelopment && url.protocol !== "https:") ||
    url.username ||
    url.password
  )
    throw new Error(
      "pairing link origin does not match this HTTPS or localhost page",
    );
  const port = url.hash
    ? new URLSearchParams(url.hash.slice(1)).get("bridgePort")
    : null;
  const token = url.hash
    ? new URLSearchParams(url.hash.slice(1)).get("bridgeToken")
    : null;
  if (
    !port ||
    !token ||
    !/^\d+$/.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65535
  )
    throw new Error("pairing link is missing bridge credentials");
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token))
    throw new Error("invalid pairing credential");
  return { websocketUrl: `ws://127.0.0.1:${port}`, token };
}
