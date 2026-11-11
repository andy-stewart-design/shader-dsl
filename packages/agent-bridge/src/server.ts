import {
  createServer as createHttpServer,
  type Server as HttpServer,
} from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { WebSocketServer, type WebSocket } from "ws";
import {
  BridgeResultError,
  bridgeResultToMcp,
  normalizeResult,
} from "./results.js";
import { validateInput, validateCatalog } from "./schema.js";
import { SessionLease } from "./session.js";
import {
  BRIDGE_CATALOG_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  LIMITS,
  isRecord,
  jsonSize,
  safeJson,
  type BridgeCatalog,
  type BridgeResult,
  type JsonValue,
} from "./protocol.js";

export type BridgeServerOptions = {
  allowedOrigin: string;
  siteUrl: string;
};

type Pending = {
  resolve: (result: BridgeResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
  sessionId: string;
  catalogVersion: number;
  resumable: boolean;
  socket: WebSocket;
};

type ActivePage = {
  socket: WebSocket;
  sessionId: string;
  pageId?: string;
  pageUrl?: string;
  resumable: boolean;
  resumeDigest?: Buffer;
};

type ConnectionInfo = {
  port: number;
  status: "unpaired" | "connected" | "interrupted";
  pairingUrl?: string;
  sessionId?: string;
  leaseExpiresAt?: number;
  limits: typeof LIMITS;
};

export type BridgeServer = {
  port: number;
  connectionInfo(): ConnectionInfo;
  attachMcp(transport: Transport): Promise<void>;
  close(): Promise<void>;
};

const connectionInfoSchema = z.object({}).strict();
const sessionSchema = z.object({ sessionId: z.string() }).strict();
const describeToolSchema = z
  .object({ sessionId: z.string(), name: z.string() })
  .strict();
const callToolSchema = z
  .object({
    sessionId: z.string(),
    catalogVersion: z.number().int(),
    name: z.string(),
    arguments: z.any(),
  })
  .strict();

export async function startBridgeServer(
  options: BridgeServerOptions,
): Promise<BridgeServer> {
  validateConfiguration(options);
  let token = "";
  let tokenDigest = Buffer.alloc(32);
  let expiresAt = 0;
  let tokenUsed = false;
  let shuttingDown = false;
  let closePromise: Promise<void> | undefined;
  let mcpServer: McpServer | undefined;

  const issuePairingCredential = () => {
    token = randomBytes(32).toString("base64url");
    tokenDigest = createHash("sha256").update(token).digest();
    expiresAt = Date.now() + LIMITS.pairingLifetimeMs;
    tokenUsed = false;
  };
  issuePairingCredential();

  let active: ActivePage | undefined;
  let catalog: BridgeCatalog | undefined;
  const pending = new Map<string, Pending>();
  const sockets = new Set<WebSocket>();
  const authenticatedSockets = new Set<WebSocket>();
  const authTimers = new Map<WebSocket, ReturnType<typeof setTimeout>>();
  const lease = new SessionLease<{ digest: Buffer }>({
    onExpire: () => {
      // An expired lease is a revocation boundary. A new pairing credential is
      // intentionally not exposed until connectionInfo is requested.
      issuePairingCredential();
    },
  });

  const http: HttpServer = createHttpServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: LIMITS.authenticatedFrameBytes,
  });

  const rejectUpgrade = (socket: import("node:stream").Duplex) => {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
  };
  http.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;
    const unauthenticated = [...sockets].filter(
      (candidate) => !authenticatedSockets.has(candidate),
    ).length;
    if (
      origin !== options.allowedOrigin ||
      unauthenticated >= LIMITS.unauthenticatedSockets
    ) {
      rejectUpgrade(socket);
      return;
    }
    wss.handleUpgrade(request, socket, head, (websocket) =>
      wss.emit("connection", websocket, request),
    );
  });

  const publicError = (code: string): string =>
    PUBLIC_ERROR_MESSAGES[code] ?? "bridge request failed";

  const send = (ws: WebSocket, value: unknown) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(value));
  };

  const cancelPending = (requestId: string, error: Error, notify = true) => {
    const call = pending.get(requestId);
    if (!call) return;
    pending.delete(requestId);
    clearTimeout(call.timer);
    if (call.signal && call.abort)
      call.signal.removeEventListener("abort", call.abort);
    if (
      notify &&
      call.resumable &&
      call.socket === active?.socket &&
      active.sessionId === call.sessionId &&
      call.socket.readyState === 1
    ) {
      send(call.socket, {
        type: "cancel",
        sessionId: call.sessionId,
        requestId,
      });
    }
    call.reject(error);
  };

  const cancelAll = (error: Error, notify = true) => {
    for (const requestId of [...pending.keys()])
      cancelPending(requestId, error, notify);
  };

  const releasePage = (ws: WebSocket, error?: Error, explicit = false) => {
    clearTimeout(authTimers.get(ws));
    authTimers.delete(ws);
    sockets.delete(ws);
    authenticatedSockets.delete(ws);
    if (active?.socket !== ws) return;

    const old = active;
    cancelAll(
      error ??
        new BridgeProtocolError(
          explicit ? "not_connected" : "not_connected",
          "page disconnected; outcome may be uncertain",
        ),
      true,
    );
    active = undefined;
    catalog = undefined;
    if (
      !explicit &&
      old.resumable &&
      old.pageId &&
      old.pageUrl &&
      old.resumeDigest &&
      !shuttingDown
    ) {
      lease.suspend({
        sessionId: old.sessionId,
        pageId: old.pageId,
        pageUrl: old.pageUrl,
        credential: { digest: old.resumeDigest },
      });
    } else {
      lease.revoke();
      issuePairingCredential();
    }
  };

  const sendAuthError = (ws: WebSocket, code: string, message: string) => {
    send(ws, {
      type: "auth_error",
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      error: { code, message },
    });
    ws.close(1008, "authentication failed");
  };

  const normalizePageUrl = (value: unknown): string | undefined => {
    if (typeof value !== "string" || value.length === 0 || value.length > 4096)
      return undefined;
    try {
      const url = new URL(value);
      if (url.origin !== options.allowedOrigin || url.username || url.password)
        return undefined;
      return url.href;
    } catch {
      return undefined;
    }
  };
  const validPageId = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= 256;

  const establish = (
    ws: WebSocket,
    input: {
      pageId?: string;
      pageUrl?: string;
      resumable: boolean;
      resumeDigest?: Buffer;
    },
  ) => {
    const sessionId = randomBytes(18).toString("base64url");
    const next: ActivePage = {
      socket: ws,
      sessionId,
      pageId: input.pageId,
      pageUrl: input.pageUrl,
      resumable: input.resumable,
      resumeDigest: input.resumeDigest,
    };
    active = next;
    catalog = undefined;
    authenticatedSockets.add(ws);
    const authOk: Record<string, unknown> = {
      type: "auth_ok",
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      sessionId,
    };
    if (input.resumable) {
      const resumeToken = randomBytes(32).toString("base64url");
      next.resumeDigest = createHash("sha256").update(resumeToken).digest();
      authOk.pageId = input.pageId;
      authOk.resumeToken = resumeToken;
      authOk.resumeLeaseMs = LIMITS.resumeLeaseMs;
    }
    send(ws, authOk);
  };

  wss.on("connection", (ws: WebSocket) => {
    sockets.add(ws);
    let authenticated = false;
    let closed = false;
    const authTimer = setTimeout(() => {
      if (!authenticated || (active?.socket === ws && !catalog))
        ws.close(1008, "authentication timeout");
    }, LIMITS.authenticationTimeoutMs);
    authTimers.set(ws, authTimer);

    const close = (error?: Error, explicit = false) => {
      if (closed) return;
      closed = true;
      releasePage(ws, error, explicit);
    };
    ws.on("close", () => close());
    ws.on("error", () => close(new Error("page transport failed")));
    ws.on("message", (raw, isBinary) => {
      const bytes = Buffer.isBuffer(raw)
        ? raw.byteLength
        : Buffer.byteLength(String(raw));
      const max = authenticated
        ? LIMITS.authenticatedFrameBytes
        : LIMITS.unauthenticatedFrameBytes;
      if (isBinary || bytes > max) {
        ws.close(1009, "message limit");
        return;
      }
      let message: any;
      try {
        message = JSON.parse(String(raw));
      } catch {
        ws.close(1007, "malformed message");
        return;
      }

      if (!authenticated) {
        if (!isRecord(message) || typeof message.type !== "string") {
          sendAuthError(ws, "invalid_message", "authentication required");
          return;
        }
        if (message.type === "auth") {
          // Do not consume a credential while an active owner exists.
          if (active) {
            sendAuthError(
              ws,
              "session_conflict",
              "another page is already paired",
            );
            return;
          }
          if (
            Date.now() > expiresAt ||
            tokenUsed ||
            typeof message.token !== "string" ||
            !constantTimeToken(message.token, tokenDigest)
          ) {
            sendAuthError(ws, "authentication_failed", "authentication failed");
            return;
          }
          const resumable = message.resumable === true;
          let pageId: string | undefined;
          let pageUrl: string | undefined;
          if (resumable) {
            pageId = validPageId(message.pageId) ? message.pageId : undefined;
            pageUrl = normalizePageUrl(message.pageUrl);
            if (!validPageId(pageId) || !pageUrl) {
              sendAuthError(ws, "invalid_message", "invalid page binding");
              return;
            }
          } else if (
            (message.resumable !== undefined && message.resumable !== false) ||
            message.pageId !== undefined ||
            message.pageUrl !== undefined
          ) {
            sendAuthError(
              ws,
              "invalid_message",
              "invalid authentication message",
            );
            return;
          }
          tokenUsed = true;
          authenticated = true;
          lease.revoke();
          establish(ws, { pageId, pageUrl, resumable });
          return;
        }
        if (message.type === "resume") {
          if (active) {
            sendAuthError(
              ws,
              "session_conflict",
              "another page is already paired",
            );
            return;
          }
          const old = lease.current;
          const pageUrl = normalizePageUrl(message.pageUrl);
          const candidate =
            old &&
            message.protocolVersion === BRIDGE_PROTOCOL_VERSION &&
            typeof message.sessionId === "string" &&
            message.sessionId === old.sessionId &&
            validPageId(message.pageId) &&
            pageUrl === old.pageUrl &&
            typeof message.resumeToken === "string" &&
            constantTimeToken(message.resumeToken, old.credential.digest);
          if (!candidate) {
            sendAuthError(ws, "invalid_resume", "resume is not valid");
            return;
          }
          // Consume only after all scope and credential checks pass.
          lease.take();
          authenticated = true;
          establish(ws, {
            pageId: validPageId(message.pageId) ? message.pageId : undefined,
            pageUrl,
            resumable: true,
          });
          return;
        }
        sendAuthError(ws, "authentication_required", "authentication required");
        return;
      }

      if (!active || active.socket !== ws || !active.sessionId) {
        ws.close(1008, "stale session");
        return;
      }
      const sessionId = active.sessionId;
      if (isRecord(message) && message.type === "disconnect") {
        if (message.sessionId !== sessionId) {
          ws.close(1008, "stale session");
          return;
        }
        releasePage(
          ws,
          new BridgeProtocolError("not_connected", "page disconnected"),
          true,
        );
        ws.close(1000, "disconnected");
        return;
      }
      if (isRecord(message) && message.type === "catalog") {
        const requestedVersion =
          typeof message.catalogVersion === "number"
            ? message.catalogVersion
            : catalog
              ? catalog.catalogVersion + 1
              : BRIDGE_CATALOG_VERSION;
        try {
          if (message.protocolVersion !== BRIDGE_PROTOCOL_VERSION)
            throw new BridgeProtocolError(
              "unsupported_protocol",
              "unsupported bridge protocol",
            );
          if (!catalog)
            validateCatalog(message, sessionId, BRIDGE_CATALOG_VERSION);
          else {
            if (message.sessionId !== sessionId)
              throw new BridgeProtocolError("stale_session", "stale session");
            if (requestedVersion !== catalog.catalogVersion + 1)
              throw new BridgeProtocolError(
                "stale_catalog",
                "catalog version is not the next version",
              );
            validateCatalog(message, sessionId, requestedVersion);
          }
        } catch (error) {
          const bridgeError =
            error instanceof BridgeProtocolError
              ? error
              : new BridgeProtocolError(
                  error instanceof Error && error.message.includes("limit")
                    ? "payload_limit"
                    : "invalid_message",
                  "invalid catalog",
                );
          send(ws, {
            type: "catalog_error",
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
            sessionId,
            catalogVersion: requestedVersion,
            error: { code: bridgeError.code, message: bridgeError.message },
          });
          return;
        }
        if (catalog)
          cancelAll(
            new BridgeProtocolError(
              "stale_catalog",
              "catalog changed; outcome may be uncertain",
            ),
          );
        catalog = message;
        clearTimeout(authTimers.get(ws));
        send(ws, {
          type: "catalog_ok",
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          sessionId,
          catalogVersion: catalog.catalogVersion,
        });
        return;
      }
      if (!catalog) {
        ws.close(1008, "catalog required");
        return;
      }
      if (isRecord(message) && message.type === "response")
        handleResponse(message, ws);
      else ws.close(1008, "unexpected message");
    });
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", () => resolve());
  });
  const address = http.address();
  if (!address || typeof address === "string")
    throw new Error("failed to bind loopback bridge");
  const port = address.port;

  function connectionInfo(): ConnectionInfo {
    const current = active;
    if (current) {
      return {
        port,
        status: "connected",
        sessionId: current.sessionId,
        limits: LIMITS,
      };
    }
    const suspended = lease.current;
    if (suspended) {
      return {
        port,
        status: "interrupted",
        sessionId: suspended.sessionId,
        leaseExpiresAt: suspended.expiresAt,
        limits: LIMITS,
      };
    }
    if (tokenUsed || Date.now() > expiresAt) issuePairingCredential();
    return {
      port,
      status: "unpaired",
      pairingUrl: makePairingUrl(options.siteUrl, port, token),
      limits: LIMITS,
    };
  }

  async function attachMcp(transport: Transport): Promise<void> {
    if (mcpServer || shuttingDown)
      throw new Error("bridge is already attached or closed");
    const server = new McpServer(
      { name: "shdr-agent-bridge", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    server.registerTool(
      "bridge_get_connection_info",
      {
        description:
          "Get loopback pairing information and effective safety limits.",
        inputSchema: connectionInfoSchema,
      },
      async (_input, extra) =>
        handleMcpTool("bridge_get_connection_info", {}, extra.signal),
    );
    server.registerTool(
      "bridge_list_tools",
      {
        description: "List tools exposed by the paired page.",
        inputSchema: sessionSchema,
      },
      async (input, extra) =>
        handleMcpTool("bridge_list_tools", input, extra.signal),
    );
    server.registerTool(
      "bridge_describe_tool",
      {
        description: "Describe one tool exposed by the paired page.",
        inputSchema: describeToolSchema,
      },
      async (input, extra) =>
        handleMcpTool("bridge_describe_tool", input, extra.signal),
    );
    server.registerTool(
      "bridge_call_tool",
      {
        description: "Call a declared tool on the paired page.",
        inputSchema: callToolSchema,
      },
      async (input, extra) =>
        handleMcpTool("bridge_call_tool", input, extra.signal),
    );
    mcpServer = server;
    const protocol = server.server;
    const previousClose = protocol.onclose;
    protocol.onclose = () => {
      previousClose?.();
      void close();
    };
    await server.connect(transport);
  }

  async function handleMcpTool(
    name: string,
    args: unknown,
    signal?: AbortSignal,
  ) {
    try {
      if (name === "bridge_get_connection_info")
        return textMcp(connectionInfo());
      if (name === "bridge_list_tools") {
        const input = args as any;
        if (!catalog || !active)
          return errorMcp("not_connected", "no page is paired");
        if (input.sessionId !== active.sessionId)
          return errorMcp("stale_session", "session is no longer current");
        return textMcp({
          sessionId: active.sessionId,
          catalogVersion: catalog.catalogVersion,
          tools: catalog.tools,
        });
      }
      if (name === "bridge_describe_tool") {
        const input = args as any;
        if (!catalog || !active)
          return errorMcp("not_connected", "no page is paired");
        if (input.sessionId !== active.sessionId)
          return errorMcp("stale_session", "session is no longer current");
        const tool = catalog.tools.find((item) => item.name === input.name);
        return tool
          ? textMcp({
              sessionId: active.sessionId,
              catalogVersion: catalog.catalogVersion,
              ...tool,
            })
          : errorMcp("unknown_tool", "unknown tool");
      }
      if (name === "bridge_call_tool") {
        const input = args as any;
        if (!catalog || !active || active.socket.readyState !== 1)
          return errorMcp("not_connected", "no page is paired");
        if (input.sessionId !== active.sessionId)
          return errorMcp("stale_session", "session is no longer current");
        if (input.catalogVersion !== catalog.catalogVersion)
          return errorMcp("stale_catalog", "catalog version is stale");
        const tool = catalog.tools.find((item) => item.name === input.name);
        if (!tool) return errorMcp("unknown_tool", "unknown tool");
        const valid = validateInput(tool.inputSchema, input.arguments);
        if (!valid.ok) return errorMcp("invalid_arguments", valid.message);
        try {
          return bridgeResultToMcp(
            await callPage(input.name, input.arguments, signal),
          );
        } catch (error) {
          const code =
            error instanceof BridgeProtocolError ? error.code : "handler_error";
          return errorMcp(code, publicError(code));
        }
      }
      return errorMcp("unknown_tool", "unknown bridge operation");
    } catch (error) {
      return errorMcp(
        "bridge_error",
        error instanceof Error ? error.message : "bridge operation failed",
      );
    }
  }

  function callPage(
    toolName: string,
    input: JsonValue,
    signal?: AbortSignal,
  ): Promise<BridgeResult> {
    if (!active || !catalog || active.socket.readyState !== 1)
      return Promise.reject(
        new BridgeProtocolError("not_connected", "not connected"),
      );
    if (signal?.aborted)
      return Promise.reject(
        new BridgeProtocolError(
          "cancelled",
          "tool cancelled; outcome may be uncertain",
        ),
      );
    if (pending.size >= LIMITS.pendingCalls)
      return Promise.reject(
        new BridgeProtocolError("payload_limit", "too many pending calls"),
      );
    const requestId = randomBytes(12).toString("base64url");
    const message = {
      type: "request",
      requestId,
      sessionId: active.sessionId,
      catalogVersion: catalog.catalogVersion,
      toolName,
      input,
    };
    if (jsonSize(message) > LIMITS.authenticatedFrameBytes)
      return Promise.reject(
        new BridgeProtocolError(
          "payload_limit",
          "request exceeds payload limit",
        ),
      );
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          cancelPending(
            requestId,
            new BridgeProtocolError(
              "timeout",
              "request timeout; outcome may be uncertain",
            ),
          ),
        LIMITS.requestTimeoutMs,
      );
      const abort = () =>
        cancelPending(
          requestId,
          new BridgeProtocolError(
            "cancelled",
            "tool cancelled; outcome may be uncertain",
          ),
        );
      const item: Pending = {
        resolve,
        reject,
        timer,
        signal,
        abort,
        sessionId: active!.sessionId,
        catalogVersion: catalog!.catalogVersion,
        resumable: active!.resumable,
        socket: active!.socket,
      };
      pending.set(requestId, item);
      if (signal) signal.addEventListener("abort", abort, { once: true });
      try {
        send(active!.socket, message);
      } catch {
        cancelPending(
          requestId,
          new BridgeProtocolError(
            "not_connected",
            "request send failed; outcome may be uncertain",
          ),
          false,
        );
      }
    });
  }

  function handleResponse(message: any, ws: WebSocket) {
    if (!isRecord(message) || typeof message.requestId !== "string") return;
    const call = pending.get(message.requestId);
    if (
      !call ||
      call.socket !== ws ||
      active?.socket !== ws ||
      active.sessionId !== call.sessionId
    )
      return;
    pending.delete(message.requestId);
    clearTimeout(call.timer);
    if (call.signal && call.abort)
      call.signal.removeEventListener("abort", call.abort);
    if (
      call.resumable
        ? message.sessionId !== call.sessionId ||
          message.catalogVersion !== call.catalogVersion
        : (message.sessionId !== undefined &&
            message.sessionId !== call.sessionId) ||
          (message.catalogVersion !== undefined &&
            message.catalogVersion !== call.catalogVersion)
    ) {
      call.reject(
        new BridgeProtocolError("stale_session", "stale page response"),
      );
      return;
    }
    if (typeof message.ok !== "boolean") {
      call.reject(
        new BridgeProtocolError("invalid_message", "malformed tool response"),
      );
      return;
    }
    if (message.ok) {
      if (
        !isRecord(message.result) ||
        !Object.prototype.hasOwnProperty.call(
          message.result,
          "bridgeResultVersion",
        )
      ) {
        call.reject(
          new BridgeProtocolError(
            "invalid_message",
            "page returned an invalid result",
          ),
        );
        return;
      }
      try {
        call.resolve(normalizeResult(message.result));
      } catch (error) {
        call.reject(
          new BridgeProtocolError(
            error instanceof BridgeResultError ? error.code : "invalid_message",
            "page returned an invalid result",
          ),
        );
      }
      return;
    }
    if (
      !isRecord(message.error) ||
      typeof message.error.code !== "string" ||
      typeof message.error.message !== "string"
    ) {
      call.reject(
        new BridgeProtocolError("invalid_message", "malformed tool error"),
      );
      return;
    }
    const code = Object.prototype.hasOwnProperty.call(
      PUBLIC_ERROR_MESSAGES,
      message.error.code,
    )
      ? message.error.code
      : "handler_error";
    call.reject(new BridgeProtocolError(code, publicError(code)));
  }

  function close(): Promise<void> {
    if (closePromise) return closePromise;
    shuttingDown = true;
    closePromise = Promise.resolve().then(async () => {
      lease.revoke();
      cancelAll(
        new BridgeProtocolError(
          "not_connected",
          "bridge closed; outcome may be uncertain",
        ),
        false,
      );
      for (const timer of authTimers.values()) clearTimeout(timer);
      authTimers.clear();
      for (const ws of sockets) {
        try {
          ws.terminate();
        } catch {
          /* already closed */
        }
      }
      sockets.clear();
      authenticatedSockets.clear();
      active = undefined;
      catalog = undefined;
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      const attached = mcpServer;
      mcpServer = undefined;
      await attached?.close();
    });
    return closePromise;
  }

  return { port, connectionInfo, attachMcp, close };
}

function validateConfiguration(options: BridgeServerOptions) {
  const origin = new URL(options.allowedOrigin);
  const site = new URL(options.siteUrl);
  const localDevelopment =
    origin.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(origin.hostname);
  if (
    (!localDevelopment && origin.protocol !== "https:") ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    origin.origin !== options.allowedOrigin
  )
    throw new Error(
      "--allowed-origin must be an exact HTTPS origin (HTTP is allowed only for localhost development)",
    );
  if (
    site.origin !== origin.origin ||
    site.username ||
    site.password ||
    site.hash
  )
    throw new Error("--site-url must be within --allowed-origin");
}

function makePairingUrl(siteUrl: string, port: number, token: string): string {
  const url = new URL(siteUrl);
  url.hash = new URLSearchParams({
    bridgePort: String(port),
    bridgeToken: token,
  }).toString();
  return url.href;
}

function constantTimeToken(candidate: string, expectedDigest: Buffer): boolean {
  const digest = createHash("sha256").update(candidate).digest();
  return (
    digest.length === expectedDigest.length &&
    timingSafeEqual(digest, expectedDigest)
  );
}

class BridgeProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BridgeProtocolError";
  }
}

const PUBLIC_ERROR_MESSAGES: Record<string, string> = {
  timeout: "tool timed out; outcome may be uncertain",
  cancelled: "tool cancelled; outcome may be uncertain",
  handler_error: "tool handler failed",
  not_connected: "page disconnected; outcome may be uncertain",
  stale_session: "session is no longer current",
  stale_catalog: "catalog changed; rediscover tools; outcome may be uncertain",
  unknown_tool: "unknown tool",
  invalid_arguments: "input does not match the declared schema",
  invalid_message: "malformed page response",
  unsupported_protocol: "unsupported bridge protocol or result version",
  payload_limit: "payload exceeds the configured limit",
};

function textMcp(value: unknown) {
  return { content: [{ type: "text" as const, text: safeJson(value) }] };
}
function errorMcp(code: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: `${code}: ${message}` }],
  };
}
