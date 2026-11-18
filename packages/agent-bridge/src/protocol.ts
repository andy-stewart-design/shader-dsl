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

/**
 * The structural JSON constraint used by typed tool helpers. Unlike JsonValue,
 * this maps named object types and readonly arrays without requiring an index
 * signature, while still excluding values with no JSON representation.
 */
export type JsonCompatible<T> =
  IsAny<T> extends true
    ? never
    : IsNever<T> extends true
      ? never
      : unknown extends T
        ? never
        : T extends JsonPrimitive
          ? T
          : T extends readonly (infer Item)[]
            ? readonly JsonCompatible<Item>[]
            : T extends object
              ? T extends Date | ((...args: never[]) => unknown)
                ? never
                : keyof T extends never
                  ? never
                  : { readonly [Key in keyof T]: JsonCompatible<T[Key]> }
              : never;

type IsAny<T> = 0 extends 1 & T ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;

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

export type BridgeTool<Output = JsonValue | BridgeResult> = {
  name: string;
  description: string;
  inputSchema: JsonObject;
  handler: (
    input: unknown,
    context: { signal: AbortSignal },
  ) => Output | Promise<Output>;
};

export type BridgeClientInfo = {
  name: string;
  version: string;
};

export type BridgeConnectionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | {
      status: "connected";
      sessionId: string;
      catalogVersion: number;
      /** Server time when this pairing authority first completed a catalog handshake. */
      connectedAt?: number;
      /** Server time when the current transport most recently completed a catalog handshake. */
      lastConnectedAt?: number;
      /** Self-reported MCP client display metadata; it is not an authenticated identity. */
      client?: BridgeClientInfo;
    }
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
      metadataUpdates?: true;
    }
  | {
      type: "resume";
      protocolVersion: 1;
      sessionId: string;
      resumeToken: string;
      pageId: string;
      pageUrl: string;
      metadataUpdates?: true;
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
      connectedAt?: number;
      lastConnectedAt?: number;
      client?: BridgeClientInfo;
    }
  | {
      type: "catalog_ok";
      protocolVersion: 1;
      sessionId: string;
      catalogVersion: number;
      connectedAt?: number;
      lastConnectedAt?: number;
      client?: BridgeClientInfo;
    }
  | {
      /** Optional additive notification for clients paired before MCP initialization. */
      type: "connection_state";
      protocolVersion: 1;
      sessionId: string;
      connectedAt?: number;
      lastConnectedAt?: number;
      client?: BridgeClientInfo;
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
    !isJsonValue(value) ||
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
  return isJsonValueWithin(value, new WeakSet<object>());
}

function isJsonValueWithin(
  value: unknown,
  ancestors: WeakSet<object>,
): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  if (Array.isArray(value)) {
    ancestors.add(value);
    let valid = true;
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) {
        valid = false;
        break;
      }
      if (!isJsonValueWithin(value[index], ancestors)) {
        valid = false;
        break;
      }
    }
    ancestors.delete(value);
    return valid;
  }
  if (!isPlainObject(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((item) =>
    isJsonValueWithin(item, ancestors),
  );
  ancestors.delete(value);
  return valid;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
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
