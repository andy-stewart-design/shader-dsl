import {
  BRIDGE_RESULT_VERSION,
  LIMITS,
  decodedBase64Bytes,
  isBase64,
  isBridgeResult,
  isJsonValue,
  isRecord,
  jsonSize,
  safeJson,
  type BridgeResult,
  type JsonValue,
} from "./protocol.js";

export { isBase64 } from "./protocol.js";

export class BridgeResultError extends Error {
  constructor(
    readonly code: "invalid_message" | "unsupported_protocol" | "payload_limit",
    message: string,
  ) {
    super(message);
    this.name = "BridgeResultError";
  }
}

export function imageResult(options: {
  data: string;
  mimeType: "image/png" | "image/jpeg";
  metadata?: JsonValue;
}): BridgeResult {
  if (options.mimeType !== "image/png" && options.mimeType !== "image/jpeg")
    throw new BridgeResultError(
      "invalid_message",
      "unsupported image MIME type",
    );
  if (!isBase64(options.data))
    throw new BridgeResultError("invalid_message", "image data must be base64");
  if (decodedBase64Bytes(options.data) > LIMITS.imageBytes)
    throw new BridgeResultError(
      "payload_limit",
      "image exceeds the decoded image limit",
    );
  if (options.metadata !== undefined && !isJsonValue(options.metadata))
    throw new BridgeResultError(
      "invalid_message",
      "image metadata must be JSON",
    );
  const result: BridgeResult = {
    bridgeResultVersion: BRIDGE_RESULT_VERSION,
    content: [
      { type: "image", mimeType: options.mimeType, data: options.data },
    ],
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
  };
  assertResultSize(result);
  return result;
}

function assertResultSize(result: BridgeResult): void {
  if (jsonSize(result) > LIMITS.authenticatedFrameBytes)
    throw new BridgeResultError(
      "payload_limit",
      "result exceeds payload limit",
    );
}

function looksLikeResultEnvelope(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, "bridgeResultVersion");
}

export function normalizeResult(value: unknown): BridgeResult {
  if (isRecord(value) && looksLikeResultEnvelope(value)) {
    if (value.bridgeResultVersion !== BRIDGE_RESULT_VERSION)
      throw new BridgeResultError(
        "unsupported_protocol",
        "unsupported bridge result version",
      );
    if (jsonSize(value) > LIMITS.authenticatedFrameBytes)
      throw new BridgeResultError(
        "payload_limit",
        "result exceeds payload limit",
      );
    if (
      Array.isArray(value.content) &&
      value.content.some(
        (part: unknown) =>
          isRecord(part) &&
          part.type === "image" &&
          typeof part.data === "string" &&
          decodedBase64Bytes(part.data) > LIMITS.imageBytes,
      )
    )
      throw new BridgeResultError(
        "payload_limit",
        "image exceeds the decoded image limit",
      );
    if (!isBridgeResult(value))
      throw new BridgeResultError(
        "invalid_message",
        "malformed bridge result envelope",
      );
    assertResultSize(value);
    return value;
  }
  if (!isJsonValue(value))
    throw new BridgeResultError(
      "invalid_message",
      "tool result must be JSON or a bridge result envelope",
    );
  const result: BridgeResult = {
    bridgeResultVersion: BRIDGE_RESULT_VERSION,
    content: [{ type: "text", text: safeJson(value) }],
  };
  assertResultSize(result);
  return result;
}

export function bridgeResultToMcp(result: BridgeResult): {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
} {
  const normalized = normalizeResult(result);
  const content = normalized.content.map((part) =>
    part.type === "image"
      ? { type: "image" as const, data: part.data, mimeType: part.mimeType }
      : { type: "text" as const, text: part.text },
  );
  if (normalized.metadata !== undefined)
    content.push({
      type: "text",
      text: `Metadata: ${safeJson(normalized.metadata)}`,
    });
  return { content };
}
