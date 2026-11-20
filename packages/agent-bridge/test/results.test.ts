import { describe, expect, it } from "vitest";
import { LIMITS, isBridgeResult, jsonSize } from "../src/protocol.js";
import {
  imageResult,
  normalizeResult,
  bridgeResultToMcp,
} from "../src/results.js";

const pixel = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
const bytesAsBase64 = (bytes: number) => Buffer.alloc(bytes).toString("base64");

const validEnvelope = () => ({
  bridgeResultVersion: 1,
  content: [{ type: "text", text: "hello" }],
});

if (false) {
  interface CaptureMetadata {
    readonly width: number;
    readonly labels?: readonly string[];
  }
  const metadata: CaptureMetadata = { width: 1, labels: ["hero"] };
  imageResult({
    data: pixel,
    mimeType: "image/png",
    metadata,
  });
  // @ts-expect-error Date metadata is not JSON-compatible.
  imageResult({ data: pixel, mimeType: "image/png", metadata: new Date() });
}

describe("result envelopes", () => {
  it("keeps ordinary JSON readable and emits MCP image and metadata blocks", () => {
    expect(
      normalizeResult({ data: pixel, mimeType: "image/png" }).content[0],
    ).toEqual({
      type: "text",
      text: JSON.stringify({ data: pixel, mimeType: "image/png" }),
    });
    const result = imageResult({
      data: pixel,
      mimeType: "image/png",
      metadata: { width: 1 },
    });
    expect(bridgeResultToMcp(result).content).toEqual([
      { type: "image", data: pixel, mimeType: "image/png" },
      { type: "text", text: 'Metadata: {"width":1}' },
    ]);
  });

  it.each([
    ["reserved result version", { ...validEnvelope(), bridgeResultVersion: 2 }],
    [
      "malformed content",
      { ...validEnvelope(), content: [{ type: "image", data: pixel }] },
    ],
    [
      "unsupported MIME",
      {
        ...validEnvelope(),
        content: [{ type: "image", data: pixel, mimeType: "image/gif" }],
      },
    ],
    [
      "malformed base64",
      {
        ...validEnvelope(),
        content: [{ type: "image", data: "not base64", mimeType: "image/png" }],
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(() => normalizeResult(value)).toThrow();
  });

  it("checks MIME at runtime and rejects unsupported result values", () => {
    expect(() =>
      // @ts-expect-error Runtime validation also protects JavaScript callers.
      imageResult({ data: pixel, mimeType: "image/gif" }),
    ).toThrow();
    expect(() => normalizeResult(() => undefined)).toThrow();
    expect(() => normalizeResult(undefined)).toThrow();
    expect(() => normalizeResult(new Date())).toThrow();
    expect(() => normalizeResult(new Map())).toThrow();
    expect(() => normalizeResult({ value: undefined })).toThrow();
    expect(() => normalizeResult({ value: BigInt(1) })).toThrow();
    expect(() => normalizeResult({ value: Symbol("nope") })).toThrow();
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => normalizeResult(sparse)).toThrow();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => normalizeResult(cyclic)).toThrow();
    expect(() => normalizeResult({ value: Number.NaN })).toThrow();
    expect(() =>
      // @ts-expect-error Runtime validation also protects JavaScript callers.
      imageResult({ data: pixel, mimeType: "image/png", metadata: new Date() }),
    ).toThrow();
    expect(() =>
      // @ts-expect-error Runtime validation also protects JavaScript callers.
      imageResult({ data: pixel, mimeType: "image/png", metadata: new Map() }),
    ).toThrow();
    expect(isBridgeResult({ bridgeResultVersion: 1, content: [] })).toBe(true);
    expect(jsonSize({ a: "x" })).toBeGreaterThan(0);
  });

  it("accepts an image at the exact decoded per-image limit but not above it", () => {
    const exact = bytesAsBase64(LIMITS.imageBytes);
    expect(
      imageResult({ data: exact, mimeType: "image/png" }).content[0],
    ).toMatchObject({ data: exact });
    expect(() =>
      imageResult({
        data: bytesAsBase64(LIMITS.imageBytes + 1),
        mimeType: "image/png",
      }),
    ).toThrow(/limit|exceeds/i);
  });

  it("enforces the full serialized result limit across text, metadata, and images", () => {
    expect(() =>
      normalizeResult({
        bridgeResultVersion: 1,
        content: [
          { type: "text", text: "x".repeat(LIMITS.authenticatedFrameBytes) },
        ],
        metadata: { source: "large" },
      }),
    ).toThrow();

    const image = bytesAsBase64(3 * 1024 * 1024);
    expect(() =>
      normalizeResult({
        bridgeResultVersion: 1,
        content: [
          { type: "image", mimeType: "image/png", data: image },
          { type: "image", mimeType: "image/png", data: image },
        ],
        metadata: { source: "two-images" },
      }),
    ).toThrow();
  });
});
