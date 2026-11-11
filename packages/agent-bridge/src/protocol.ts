/** Wire and public contracts for the generic page bridge. */
export const BRIDGE_PROTOCOL_VERSION = 1 as const;
/** The first catalog version sent during authentication. Replacements increment it. */
export const BRIDGE_CATALOG_VERSION = 1 as const;
export const BRIDGE_RESULT_VERSION = 1 as const;

export const LIMITS = {
  pairingLifetimeMs: 5 * 60_000,
  authenticationTimeoutMs: 5_000,
  requestTimeoutMs: 30_000,
  resumeLeaseMs: 30_000,
  reconnectInitialDelayMs: 250,
  reconnectMaxDelayMs: 2_000,
  unauthenticatedFrameBytes: 4 * 1024,
  authenticatedFrameBytes: 8 * 1024 * 1024,
  imageBytes: 4 * 1024 * 1024,
  unauthenticatedSockets: 4,
  pendingCalls: 8,
  tools: 64,
  catalogBytes: 512 * 1024,
} as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
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

export type CatalogTool = Pick<
  BridgeTool,
  "name" | "description" | "inputSchema"
>;
export type BridgeCatalog = {
  type: "catalog";
  protocolVersion: 1;
  catalogVersion: number;
  sessionId: string;
  tools: readonly CatalogTool[];
};

export type BridgeWireMessage =
  | {
      type: "auth";
      token: string;
      resumable?: boolean;
      pageId?: string;
      pageUrl?: string;
    }
  | {
      type: "resume";
      protocolVersion: 1;
      sessionId: string;
      resumeToken: string;
      pageId: string;
      pageUrl: string;
    }
  | { type: "disconnect"; sessionId: string }
  | { type: "cancel"; sessionId: string; requestId: string }
  | { type: "auth_error"; protocolVersion: 1; error: BridgeError }
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
      sessionId?: string;
      catalogVersion?: number;
      ok: boolean;
      result?: BridgeResult;
      error?: BridgeError;
    }
  | {
      type: "auth_ok";
      protocolVersion: 1;
      sessionId: string;
      pageId?: string;
      resumeToken?: string;
      resumeLeaseMs?: number;
    }
  | {
      type: "catalog_ok";
      protocolVersion: 1;
      sessionId: string;
      catalogVersion: number;
    }
  | {
      type: "catalog_error";
      protocolVersion: 1;
      sessionId: string;
      catalogVersion: number;
      error: BridgeError;
    };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function jsonSize(value: unknown): number {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error("value is not JSON serializable");
  return typeof TextEncoder === "undefined"
    ? text.length
    : new TextEncoder().encode(text).byteLength;
}

export function wireByteLength(value: unknown): number {
  if (typeof value === "string") return jsonUtf8Bytes(value);
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return jsonUtf8Bytes(String(value));
}

function jsonUtf8Bytes(value: string): number {
  return typeof TextEncoder === "undefined"
    ? unescape(encodeURIComponent(value)).length
    : new TextEncoder().encode(value).byteLength;
}

export function isBridgeResult(value: unknown): value is BridgeResult {
  if (
    !isRecord(value) ||
    value.bridgeResultVersion !== BRIDGE_RESULT_VERSION ||
    !Array.isArray(value.content)
  )
    return false;
  if (value.metadata !== undefined && !isJsonValue(value.metadata))
    return false;
  if (
    !value.content.every((part) => {
      if (!isRecord(part) || (part.type !== "text" && part.type !== "image"))
        return false;
      if (part.type === "text") return typeof part.text === "string";
      return (
        (part.mimeType === "image/png" || part.mimeType === "image/jpeg") &&
        typeof part.data === "string" &&
        isBase64(part.data) &&
        decodedBase64Bytes(part.data) <= LIMITS.imageBytes
      );
    })
  )
    return false;
  try {
    return jsonSize(value) <= LIMITS.authenticatedFrameBytes;
  } catch {
    return false;
  }
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

/** Strict, canonical RFC 4648 base64 (empty image payloads are not useful). */
export function isBase64(value: string): boolean {
  if (
    !value.length ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    return false;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (value.endsWith("=="))
    return (alphabet.indexOf(value[value.length - 3]!) & 15) === 0;
  if (value.endsWith("="))
    return (alphabet.indexOf(value[value.length - 2]!) & 3) === 0;
  return true;
}

export function decodedBase64Bytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, (value.length * 3) / 4 - padding);
}

export function safeJson(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "undefined" : serialized;
  } catch {
    return "[unserializable value]";
  }
}
