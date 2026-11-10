import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, type WebSocket } from "ws";
import { bridgeResultToMcp, normalizeResult } from "./results.js";
import { compileInputSchema, validateInput, validateToolName } from "./schema.js";
import {
  BRIDGE_CATALOG_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  LIMITS,
  isRecord,
  isJsonValue,
  jsonSize,
  safeJson,
  type BridgeCatalog,
  type BridgeError,
  type BridgeResult,
  type CatalogTool,
  type JsonValue,
} from "./protocol.js";

export type BridgeServerOptions = {
  allowedOrigin: string;
  siteUrl: string;
};

type Pending = { resolve: (result: BridgeResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export type BridgeServer = {
  port: number;
  connectionInfo(): { port: number; pairingUrl?: string; sessionId?: string; limits: typeof LIMITS };
  attachMcp(transport: StdioServerTransport): Promise<void>;
  close(): Promise<void>;
};

const emptySchema = { type: "object", properties: {}, additionalProperties: false } as const;

export async function startBridgeServer(options: BridgeServerOptions): Promise<BridgeServer> {
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
  const http: HttpServer = createHttpServer((_request, response) => { response.writeHead(404); response.end(); });
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.authenticatedFrameBytes });

  const rejectUpgrade = (socket: import("node:stream").Duplex) => {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
  };
  http.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;
    if (origin !== options.allowedOrigin || sockets.size >= LIMITS.unauthenticatedSockets) { rejectUpgrade(socket); return; }
    wss.handleUpgrade(request, socket, head, (websocket) => wss.emit("connection", websocket, request));
  });

  wss.on("connection", (ws: WebSocket) => {
    sockets.add(ws);
    let authenticated = false;
    let closed = false;
    const authTimer = setTimeout(() => { if (!authenticated) ws.close(1008, "authentication timeout"); }, LIMITS.authenticationTimeoutMs);
    const close = (error?: Error) => {
      if (closed) return;
      closed = true;
      clearTimeout(authTimer);
      sockets.delete(ws);
      if (owner === ws) {
        owner = undefined; sessionId = undefined; catalog = undefined;
        issuePairingCredential();
        for (const call of pending.values()) { clearTimeout(call.timer); call.reject(error ?? new Error("page disconnected")); }
        pending.clear();
      }
    };
    ws.on("close", () => close());
    ws.on("error", () => close(new Error("page transport failed")));
    ws.on("message", (raw, isBinary) => {
      const bytes = Buffer.isBuffer(raw) ? raw.byteLength : Buffer.byteLength(String(raw));
      const max = authenticated ? LIMITS.authenticatedFrameBytes : LIMITS.unauthenticatedFrameBytes;
      if (isBinary || bytes > max) { ws.close(1009, "message limit"); return; }
      let message: any;
      try { message = JSON.parse(String(raw)); } catch { ws.close(1007, "malformed message"); return; }
      if (!authenticated) {
        if (!isRecord(message) || message.type !== "auth" || typeof message.token !== "string") { ws.close(1008, "authentication required"); return; }
        if (Date.now() > expiresAt || tokenUsed || !constantTimeToken(message.token, tokenDigest)) { ws.close(1008, "authentication failed"); return; }
        if (owner) { ws.close(1008, "another page is already paired"); return; }
        tokenUsed = true;
        authenticated = true;
        clearTimeout(authTimer);
        sessionId = randomBytes(18).toString("base64url");
        owner = ws;
        ws.send(JSON.stringify({ type: "auth_ok", protocolVersion: BRIDGE_PROTOCOL_VERSION, sessionId }));
        return;
      }
      if (owner !== ws || !sessionId) { ws.close(1008, "stale session"); return; }
      if (!catalog) {
        if (!isCatalog(message) || message.sessionId !== sessionId) { ws.close(1008, "catalog required"); return; }
        try { validateCatalog(message); } catch { ws.close(1008, "invalid catalog"); return; }
        catalog = message;
        ws.send(JSON.stringify({ type: "catalog_ok", sessionId, catalogVersion: catalog.catalogVersion }));
        return;
      }
      if (isRecord(message) && message.type === "response") handleResponse(message);
      else ws.close(1008, "unexpected message");
    });
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", () => resolve());
  });
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("failed to bind loopback bridge");
  const port = address.port;

  function connectionInfo() {
    const active = owner && sessionId ? { sessionId } : {};
    const result: { port: number; pairingUrl?: string; sessionId?: string; limits: typeof LIMITS } = { port, ...active, limits: LIMITS };
    if (!owner) {
      if (tokenUsed || Date.now() > expiresAt) issuePairingCredential();
      result.pairingUrl = makePairingUrl(options.siteUrl, port, token);
    }
    return result;
  }

  async function attachMcp(transport: StdioServerTransport): Promise<void> {
    const server = new Server({ name: "shdr-agent-bridge", version: "0.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
      { name: "bridge_get_connection_info", description: "Get the loopback pairing information and effective safety limits.", inputSchema: emptySchema },
      { name: "bridge_list_tools", description: "List tools exposed by the paired page.", inputSchema: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"], additionalProperties: false } },
      { name: "bridge_describe_tool", description: "Describe one tool exposed by the paired page.", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, name: { type: "string" } }, required: ["sessionId", "name"], additionalProperties: false } },
      { name: "bridge_call_tool", description: "Call a declared tool on the paired page.", inputSchema: { type: "object", properties: { sessionId: { type: "string" }, catalogVersion: { type: "integer" }, name: { type: "string" }, arguments: {} }, required: ["sessionId", "catalogVersion", "name", "arguments"], additionalProperties: false } },
    ] }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = (request.params.arguments ?? {}) as unknown;
      try {
        if (name === "bridge_get_connection_info") return textMcp(connectionInfo());
        if (name === "bridge_list_tools") {
          const input = args as any;
          if (!catalog || !sessionId) return errorMcp("not_connected", "no page is paired");
          if (input.sessionId !== sessionId) return errorMcp("stale_session", "session is no longer current");
          return textMcp({ sessionId, catalogVersion: catalog.catalogVersion, tools: catalog.tools });
        }
        if (name === "bridge_describe_tool") {
          const input = args as any;
          if (!catalog || !sessionId) return errorMcp("not_connected", "no page is paired");
          if (input.sessionId !== sessionId) return errorMcp("stale_session", "session is no longer current");
          const tool = catalog.tools.find((item) => item.name === input.name);
          return tool ? textMcp(tool) : errorMcp("unknown_tool", "unknown tool");
        }
        if (name === "bridge_call_tool") {
          const input = args as any;
          if (!catalog || !sessionId || owner?.readyState !== 1) return errorMcp("not_connected", "no page is paired");
          if (input.sessionId !== sessionId) return errorMcp("stale_session", "session is no longer current");
          if (input.catalogVersion !== catalog.catalogVersion) return errorMcp("stale_catalog", "catalog version is stale");
          const tool = catalog.tools.find((item) => item.name === input.name);
          if (!tool) return errorMcp("unknown_tool", "unknown tool");
          const valid = validateInput(tool.inputSchema, input.arguments);
          if (!valid.ok) return errorMcp("invalid_arguments", valid.message);
          try { return bridgeResultToMcp(await callPage(input.name, input.arguments)); }
          catch (error) { return errorMcp(error instanceof Error && error.message.includes("timeout") ? "timeout" : "handler_error", error instanceof Error ? error.message : "page request failed"); }
        }
        return errorMcp("unknown_tool", "unknown bridge operation");
      } catch (error) { return errorMcp("bridge_error", error instanceof Error ? error.message : "bridge operation failed"); }
    });
    await server.connect(transport);
  }

  function callPage(toolName: string, input: JsonValue): Promise<BridgeResult> {
    if (!owner || !sessionId || !catalog) return Promise.reject(new Error("not connected"));
    if (pending.size >= LIMITS.pendingCalls) return Promise.reject(new Error("too many pending calls"));
    const requestId = randomBytes(12).toString("base64url");
    const message = { type: "request", requestId, sessionId, catalogVersion: catalog.catalogVersion, toolName, input };
    if (jsonSize(message) > LIMITS.authenticatedFrameBytes) return Promise.reject(new Error("request exceeds payload limit"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error("request timeout; outcome may be uncertain")); }, LIMITS.requestTimeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      try { owner!.send(JSON.stringify(message)); } catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error instanceof Error ? error : new Error("send failed")); }
    });
  }

  function handleResponse(message: any) {
    if (typeof message.requestId !== "string") return;
    const call = pending.get(message.requestId);
    if (!call) return;
    pending.delete(message.requestId); clearTimeout(call.timer);
    try {
      if (message.ok && isValidResult(message.result)) call.resolve(normalizeResult(message.result));
      else call.reject(new Error("page tool failed"));
    } catch {
      call.reject(new Error("page returned an invalid result"));
    }
  }

  return {
    port,
    connectionInfo,
    attachMcp,
    close: async () => {
      for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new Error("bridge closed")); }
      pending.clear();
      for (const ws of sockets) ws.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

function validateConfiguration(options: BridgeServerOptions) {
  const origin = new URL(options.allowedOrigin);
  const site = new URL(options.siteUrl);
  const localDevelopment = origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname);
  if ((!localDevelopment && origin.protocol !== "https:") || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password || origin.origin !== options.allowedOrigin) throw new Error("--allowed-origin must be an exact HTTPS origin (HTTP is allowed only for localhost development)");
  if (site.origin !== origin.origin || site.username || site.password) throw new Error("--site-url must be within --allowed-origin");
}

function makePairingUrl(siteUrl: string, port: number, token: string): string {
  const url = new URL(siteUrl);
  url.hash = new URLSearchParams({ bridgePort: String(port), bridgeToken: token }).toString();
  return url.href;
}

function constantTimeToken(candidate: string, expectedDigest: Buffer): boolean {
  const digest = createHash("sha256").update(candidate).digest();
  return digest.length === expectedDigest.length && timingSafeEqual(digest, expectedDigest);
}

function isCatalog(value: unknown): value is BridgeCatalog {
  return isRecord(value) && value.type === "catalog" && value.protocolVersion === 1 && typeof value.sessionId === "string" && typeof value.catalogVersion === "number" && Array.isArray(value.tools);
}

function validateCatalog(catalog: BridgeCatalog) {
  if (catalog.catalogVersion !== BRIDGE_CATALOG_VERSION || catalog.tools.length > LIMITS.tools) throw new Error("invalid catalog");
  const names = new Set<string>();
  for (const tool of catalog.tools) {
    if (!isRecord(tool) || !validateToolName(tool.name) || names.has(tool.name) || typeof tool.description !== "string" || !isRecord(tool.inputSchema)) throw new Error("invalid catalog tool");
    names.add(tool.name); compileInputSchema(tool.inputSchema);
  }
  if (jsonSize(catalog) > LIMITS.catalogBytes) throw new Error("catalog too large");
}

function isValidResult(value: unknown): value is BridgeResult {
  return isRecord(value) && value.bridgeResultVersion === 1 && Array.isArray(value.content);
}

function textMcp(value: unknown) { return { content: [{ type: "text" as const, text: safeJson(value) }] }; }
function errorMcp(code: string, message: string) { return { isError: true, content: [{ type: "text" as const, text: `${code}: ${message}` }] }; }
