import {
  BRIDGE_RESULT_VERSION,
  LIMITS,
  isBridgeResult,
  isJsonValue,
  safeJson,
  type BridgeResult,
  type JsonValue,
} from "./protocol.js";

export function imageResult(options: {
  data: string;
  mimeType: "image/png" | "image/jpeg";
  metadata?: JsonValue;
}): BridgeResult {
  if (!isBase64(options.data)) throw new Error("image data must be base64");
  if (decodedBase64Bytes(options.data) > LIMITS.imageBytes) throw new Error("image exceeds the decoded image limit");
  if (options.metadata !== undefined && !isJsonValue(options.metadata)) throw new Error("image metadata must be JSON");
  return {
    bridgeResultVersion: BRIDGE_RESULT_VERSION,
    content: [{ type: "image", mimeType: options.mimeType, data: options.data }],
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
  };
}

export function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function decodedBase64Bytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, (value.length * 3) / 4 - padding);
}

export function normalizeResult(value: unknown): BridgeResult {
  if (isBridgeResult(value)) {
    for (const part of value.content) {
      if (part.type === "image" && decodedBase64Bytes(part.data) > LIMITS.imageBytes) {
        throw new Error("image exceeds the decoded image limit");
      }
    }
    return value;
  }
  if (!isJsonValue(value)) throw new Error("tool result must be JSON or a bridge result envelope");
  return { bridgeResultVersion: BRIDGE_RESULT_VERSION, content: [{ type: "text", text: safeJson(value) }] };
}

export function bridgeResultToMcp(result: BridgeResult): {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
} {
  const content = result.content.map((part) =>
    part.type === "image"
      ? { type: "image" as const, data: part.data, mimeType: part.mimeType }
      : { type: "text" as const, text: part.text },
  );
  if (result.metadata !== undefined) content.push({ type: "text", text: `Metadata: ${safeJson(result.metadata)}` });
  return { content };
}
