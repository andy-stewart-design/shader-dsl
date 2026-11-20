import { describe, expect, it } from "vitest";
import { LIMITS, isBase64, isBridgeResult, jsonSize } from "../src/protocol.js";
import {
  validateCatalog,
  validateCatalogTools,
  validateInput,
} from "../src/schema.js";

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

  it("accepts local schema definitions but never external reference loading", () => {
    const schema = {
      type: "object",
      $defs: { text: { type: "string", minLength: 2 } },
      properties: { value: { $ref: "#/$defs/text" } },
      required: ["value"],
    };
    expect(validateInput(schema, { value: "ok" })).toEqual({ ok: true });
    expect(validateInput(schema, { value: 3 }).ok).toBe(false);
    expect(
      validateInput({ $dynamicRef: "https://example.invalid/schema" }, {}).ok,
    ).toBe(false);
  });

  it("rejects invalid catalogs before they can replace the current set", () => {
    const tool = {
      name: "read",
      description: "read",
      inputSchema: { type: "object" },
    };
    expect(() => validateCatalogTools([tool, tool])).toThrow();
    expect(() =>
      validateCatalogTools([{ ...tool, name: "invalid tool name" }]),
    ).toThrow();
    expect(() =>
      validateCatalogTools(
        Array.from({ length: LIMITS.tools + 1 }, (_, i) => ({
          ...tool,
          name: `read_${i}`,
        })),
      ),
    ).toThrow();
    expect(() =>
      validateCatalogTools([
        { ...tool, description: "x".repeat(LIMITS.catalogBytes) },
      ]),
    ).toThrow(/limit/);
    expect(() =>
      validateCatalog(
        {
          type: "catalog",
          protocolVersion: 2,
          catalogVersion: 1,
          sessionId: "s",
          tools: [tool],
        },
        "s",
        1,
      ),
    ).toThrow();
  });

  it("requires canonical base64 padding", () => {
    expect(isBase64("AA==")).toBe(true);
    expect(isBase64("AB==")).toBe(false);
    expect(isBase64("AAA=")).toBe(true);
    expect(isBase64("AAB=")).toBe(false);
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
