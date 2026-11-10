import { describe, expect, it } from "vitest";
import {
  imageResult,
  normalizeResult,
  bridgeResultToMcp,
} from "../src/results.js";

const pixel = "iVBORw0KGgo=";

describe("result envelopes", () => {
  it("keeps ordinary JSON readable and emits MCP image blocks", () => {
    expect(normalizeResult({ answer: 42 }).content[0]).toEqual({
      type: "text",
      text: '{"answer":42}',
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

  it("rejects malformed images and unsupported result values", () => {
    expect(() =>
      imageResult({ data: "not base64", mimeType: "image/png" }),
    ).toThrow();
    expect(() => normalizeResult(() => undefined)).toThrow();
  });
});
