import { describe, expect, it } from "vitest";
import { LIMITS, isBridgeResult, jsonSize } from "../src/protocol.js";
import { validateInput } from "../src/schema.js";

describe("bridge contracts", () => {
  it("validates nested JSON schema input synchronously", () => {
    const schema = {
      type: "object",
      properties: { value: { type: "string", minLength: 2 } },
      required: ["value"],
      additionalProperties: false,
    };
    expect(validateInput(schema, { value: "ok" })).toEqual({ ok: true });
    expect(validateInput(schema, { value: "x" }).ok).toBe(false);
    expect(
      validateInput(
        {
          type: "object",
          properties: { x: { $ref: "https://example.invalid/schema" } },
        },
        {},
      ),
    ).toMatchObject({ ok: false });
  });

  it("has finite published limits and recognizes only versioned envelopes", () => {
    expect(LIMITS.authenticatedFrameBytes).toBe(8 * 1024 * 1024);
    expect(
      isBridgeResult({
        bridgeResultVersion: 1,
        content: [{ type: "text", text: "hello" }],
      }),
    ).toBe(true);
    expect(isBridgeResult({ bridgeResultVersion: 2, content: [] })).toBe(false);
    expect(jsonSize({ a: "x" })).toBeGreaterThan(0);
  });
});
