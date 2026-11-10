/** Wire and public contracts for the generic page bridge. */
export const BRIDGE_PROTOCOL_VERSION = 1 as const;
export const BRIDGE_RESULT_VERSION = 1 as const;
export const BRIDGE_CATALOG_VERSION = 1 as const;

export const LIMITS = {
  pairingLifetimeMs: 5 * 60_000,
  authenticationTimeoutMs: 5_000,
  requestTimeoutMs: 30_000,
  unauthenticatedFrameBytes: 4 * 1024,
  authenticatedFrameBytes: 8 * 1024 * 1024,
  imageBytes: 4 * 1024 * 1024,
  unauthenticatedSockets: 4,
  pendingCalls: 8,
  tools: 64,
  catalogBytes: 512 * 1024,
} as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type BridgeTextContent = { type: "text"; text: string };
export type BridgeImageContent = {
  type: "image";
  mimeType: "image/png" | "image/jpeg";
  data: string;
};
export type BridgeContent = BridgeTextContent | BridgeImageContent;
export type BridgeResult = {
  bridgeResultVersion: 1;
  content: readonly BridgeContent[];
  metadata?: JsonValue;
};

export type BridgeTool = {
  name: string;
  description: string;
  inputSchema: JsonObject;
  handler: (
    input: unknown,
    context: { signal: AbortSignal },
  ) => JsonValue | BridgeResult | Promise<JsonValue | BridgeResult>;
};

export type BridgeConnectionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; sessionId: string; catalogVersion: number }
  | { status: "error"; error: { code: string; message: string } };

export type BridgeError = { code: string; message: string };

export type CatalogTool = Pick<BridgeTool, "name" | "description" | "inputSchema">;
export type BridgeCatalog = {
  type: "catalog";
  protocolVersion: 1;
  catalogVersion: number;
  sessionId: string;
  tools: readonly CatalogTool[];
};

export type BridgeWireMessage =
  | { type: "auth"; token: string }
  | BridgeCatalog
  | {
      type: "request";
      requestId: string;
      sessionId: string;
      catalogVersion: number;
      toolName: string;
      input: JsonValue;
    }
  | {
      type: "response";
      requestId: string;
      ok: boolean;
      result?: BridgeResult;
      error?: BridgeError;
    }
  | { type: "auth_ok"; sessionId: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function jsonSize(value: unknown): number {
  const text = JSON.stringify(value);
  return typeof TextEncoder === "undefined" ? text.length : new TextEncoder().encode(text).byteLength;
}

export function isBridgeResult(value: unknown): value is BridgeResult {
  if (!isRecord(value) || value.bridgeResultVersion !== 1 || !Array.isArray(value.content)) return false;
  if (value.metadata !== undefined && !isJsonValue(value.metadata)) return false;
  return value.content.every((part) => {
    if (!isRecord(part) || (part.type !== "text" && part.type !== "image")) return false;
    if (part.type === "text") return typeof part.text === "string";
    return (
      (part.mimeType === "image/png" || part.mimeType === "image/jpeg") &&
      typeof part.data === "string" &&
      isBase64(part.data)
    );
  });
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

export function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

export function safeJson(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "undefined" : serialized;
  } catch {
    return "[unserializable value]";
  }
}
