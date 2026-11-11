import {
  createServer as createHttpServer,
  type Server as HttpServer,
} from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { WebSocketServer, type WebSocket } from "ws";
import {
  BridgeResultError,
  bridgeResultToMcp,
  normalizeResult,
} from "./results.js";
import { validateInput, validateCatalog } from "./schema.js";
import {
  BRIDGE_CATALOG_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  LIMITS,
  isBridgeResult,
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
};

export type BridgeServer = {
  port: number;
  connectionInfo(): {
    port: number;
    pairingUrl?: string;
    sessionId?: string;
    limits: typeof LIMITS;
  };
  attachMcp(transport: StdioServerTransport): Promise<void>;
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
  let token = randomBytes(32).toString("base64url");
  let tokenDigest = createHash("sha256").update(token).digest();
  let expiresAt = Date.now() + LIMITS.pairingLifetimeMs;
  let tokenUsed = false;
  const issuePairingCredential = () => {
    token = randomBytes(32).toString("base64url");
    tokenDigest = createHash("sha256").update(token).digest();
    expiresAt = Date.now() + LIMITS.pairingLifetimeMs;
    tokenUsed = false;
  };
  let owner: WebSocket | undefined;
  let sessionId: string | undefined;
  let catalog: BridgeCatalog | undefined;
  const pending = new Map<string, Pending>();
  const sockets = new Set<WebSocket>();
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
    if (
      origin !== options.allowedOrigin ||
      sockets.size >= LIMITS.unauthenticatedSockets
    ) {
      rejectUpgrade(socket);
      return;
    }
    wss.handleUpgrade(request, socket, head, (websocket) =>
      wss.emit("connection", websocket, request),
    );
  });

  wss.on("connection", (ws: WebSocket) => {
    sockets.add(ws);
    let authenticated = false;
    let closed = false;
    const authTimer = setTimeout(() => {
      if (!authenticated || (owner === ws && !catalog))
        ws.close(1008, "authentication timeout");
    }, LIMITS.authenticationTimeoutMs);
    const close = (error?: Error) => {
      if (closed) return;
      closed = true;
      clearTimeout(authTimer);
      sockets.delete(ws);
      if (owner === ws) {
        owner = undefined;
        sessionId = undefined;
        catalog = undefined;
        issuePairingCredential();
        for (const call of pending.values()) {
          clearTimeout(call.timer);
          call.reject(error ?? new Error("page disconnected"));
        }
        pending.clear();
      }
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
        if (
          !isRecord(message) ||
          message.type !== "auth" ||
          typeof message.token !== "string"
        ) {
          ws.close(1008, "authentication required");
          return;
        }
        if (
          Date.now() > expiresAt ||
          tokenUsed ||
          !constantTimeToken(message.token, tokenDigest)
        ) {
          ws.close(1008, "authentication failed");
          return;
        }
        if (owner) {
          ws.close(1008, "another page is already paired");
          return;
        }
        tokenUsed = true;
        authenticated = true;
        sessionId = randomBytes(18).toString("base64url");
        owner = ws;
        ws.send(
          JSON.stringify({
            type: "auth_ok",
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
            sessionId,
          }),
        );
        return;
      }
      if (owner !== ws || !sessionId) {
        ws.close(1008, "stale session");
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
          if (!catalog) {
            validateCatalog(message, sessionId, BRIDGE_CATALOG_VERSION);
          } else {
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
          if (sessionId) {
            ws.send(
              JSON.stringify({
                type: "catalog_error",
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                sessionId,
                catalogVersion: requestedVersion,
                error: { code: bridgeError.code, message: bridgeError.message },
              }),
            );
          }
          return;
        }
        // Outstanding work belongs to the old catalog, never the replacement.
        if (catalog) {
          for (const call of pending.values()) {
            clearTimeout(call.timer);
            call.reject(
              new BridgeProtocolError(
                "stale_catalog",
                "catalog changed; outcome may be uncertain",
              ),
            );
          }
          pending.clear();
        }
        // Validation is complete before replacing the current catalog.
        catalog = message;
        clearTimeout(authTimer);
        ws.send(
          JSON.stringify({
            type: "catalog_ok",
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
            sessionId,
            catalogVersion: catalog.catalogVersion,
          }),
        );
        return;
      }
      if (!catalog) {
        ws.close(1008, "catalog required");
        return;
      }
      if (isRecord(message) && message.type === "response")
        handleResponse(message);
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

  function connectionInfo() {
    const active = owner && sessionId ? { sessionId } : {};
    const result: {
      port: number;
      pairingUrl?: string;
      sessionId?: string;
      limits: typeof LIMITS;
    } = { port, ...active, limits: LIMITS };
    if (!owner) {
      if (tokenUsed || Date.now() > expiresAt) issuePairingCredential();
      result.pairingUrl = makePairingUrl(options.siteUrl, port, token);
    }
    return result;
  }

  async function attachMcp(transport: StdioServerTransport): Promise<void> {
    const server = new McpServer(
      { name: "shdr-agent-bridge", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    server.registerTool(
      "bridge_get_connection_info",
      {
        description:
          "Get the loopback pairing information and effective safety limits.",
        inputSchema: connectionInfoSchema,
      },
      async () => handleMcpTool("bridge_get_connection_info", {}),
    );
    server.registerTool(
      "bridge_list_tools",
      {
        description: "List tools exposed by the paired page.",
        inputSchema: sessionSchema,
      },
      async (input) => handleMcpTool("bridge_list_tools", input),
    );
    server.registerTool(
      "bridge_describe_tool",
      {
        description: "Describe one tool exposed by the paired page.",
        inputSchema: describeToolSchema,
      },
      async (input) => handleMcpTool("bridge_describe_tool", input),
    );
    server.registerTool(
      "bridge_call_tool",
      {
        description: "Call a declared tool on the paired page.",
        inputSchema: callToolSchema,
      },
      async (input) => handleMcpTool("bridge_call_tool", input),
    );
    await server.connect(transport);
  }

  async function handleMcpTool(name: string, args: unknown) {
    try {
      if (name === "bridge_get_connection_info")
        return textMcp(connectionInfo());
      if (name === "bridge_list_tools") {
        const input = args as any;
        if (!catalog || !sessionId)
          return errorMcp("not_connected", "no page is paired");
        if (input.sessionId !== sessionId)
          return errorMcp("stale_session", "session is no longer current");
        return textMcp({
          sessionId,
          catalogVersion: catalog.catalogVersion,
          tools: catalog.tools,
        });
      }
      if (name === "bridge_describe_tool") {
        const input = args as any;
        if (!catalog || !sessionId)
          return errorMcp("not_connected", "no page is paired");
        if (input.sessionId !== sessionId)
          return errorMcp("stale_session", "session is no longer current");
        const tool = catalog.tools.find((item) => item.name === input.name);
        return tool
          ? textMcp({
              sessionId,
              catalogVersion: catalog.catalogVersion,
              ...tool,
            })
          : errorMcp("unknown_tool", "unknown tool");
      }
      if (name === "bridge_call_tool") {
        const input = args as any;
        if (!catalog || !sessionId || owner?.readyState !== 1)
          return errorMcp("not_connected", "no page is paired");
        if (input.sessionId !== sessionId)
          return errorMcp("stale_session", "session is no longer current");
        if (input.catalogVersion !== catalog.catalogVersion)
          return errorMcp("stale_catalog", "catalog version is stale");
        const tool = catalog.tools.find((item) => item.name === input.name);
        if (!tool) return errorMcp("unknown_tool", "unknown tool");
        const valid = validateInput(tool.inputSchema, input.arguments);
        if (!valid.ok) return errorMcp("invalid_arguments", valid.message);
        try {
          return bridgeResultToMcp(await callPage(input.name, input.arguments));
        } catch (error) {
          const code =
            error instanceof BridgeProtocolError
              ? error.code
              : error instanceof Error && error.message.includes("timeout")
                ? "timeout"
                : "handler_error";
          return errorMcp(code, publicErrorMessage(error, code));
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

  function callPage(toolName: string, input: JsonValue): Promise<BridgeResult> {
    if (!owner || !sessionId || !catalog)
      return Promise.reject(
        new BridgeProtocolError("not_connected", "not connected"),
      );
    if (pending.size >= LIMITS.pendingCalls)
      return Promise.reject(
        new BridgeProtocolError("payload_limit", "too many pending calls"),
      );
    const requestId = randomBytes(12).toString("base64url");
    const message = {
      type: "request",
      requestId,
      sessionId,
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
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(
          new BridgeProtocolError(
            "timeout",
            "request timeout; outcome may be uncertain",
          ),
        );
      }, LIMITS.requestTimeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      try {
        owner!.send(JSON.stringify(message));
      } catch (error) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error instanceof Error ? error : new Error("send failed"));
      }
    });
  }

  function handleResponse(message: any) {
    if (!isRecord(message) || typeof message.requestId !== "string") return;
    const call = pending.get(message.requestId);
    if (!call) return;
    pending.delete(message.requestId);
    clearTimeout(call.timer);
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
    call.reject(new BridgeProtocolError(code, PUBLIC_ERROR_MESSAGES[code]!));
  }

  return {
    port,
    connectionInfo,
    attachMcp,
    close: async () => {
      for (const call of pending.values()) {
        clearTimeout(call.timer);
        call.reject(new Error("bridge closed"));
      }
      pending.clear();
      for (const ws of sockets) ws.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
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
  if (site.origin !== origin.origin || site.username || site.password)
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

function publicErrorMessage(_error: unknown, code: string): string {
  return PUBLIC_ERROR_MESSAGES[code] ?? "bridge request failed";
}

function textMcp(value: unknown) {
  return { content: [{ type: "text" as const, text: safeJson(value) }] };
}
function errorMcp(code: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: `${code}: ${message}` }],
  };
}
