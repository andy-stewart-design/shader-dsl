import { describe, expect, it } from "vitest";
import { normalizeResult } from "../src/results.js";
import { compileInputSchema } from "../src/schema.js";
import { defineTool, z } from "../src/zod.js";

// Compile-time inference regression: this block is deliberately never run.
if (false) {
  defineTool({
    name: "inference",
    description: "inference",
    input: z.strictObject({ count: z.number() }),
    handler: (input) => {
      const count: number = input.count;
      // @ts-expect-error The callback must not receive raw unknown input.
      input.missing;
      return { count };
    },
  });
}

describe("defineTool", () => {
  it("generates a transport-compatible strict JSON Schema and parses input", async () => {
    let received: { count: number } | undefined;
    const tool = defineTool({
      name: "count",
      description: "Count",
      input: z.strictObject({ count: z.number().int().min(0) }),
      handler: (input) => {
        received = input;
        return { count: input.count };
      },
    });

    expect(tool.inputSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["count"],
    });
    const validate = compileInputSchema(tool.inputSchema);
    expect(validate({ count: 2 })).toBe(true);
    expect(validate({ count: 2, extra: true })).toBe(false);
    expect(validate({ count: -1 })).toBe(false);
    expect(
      await tool.handler(
        { count: 2 },
        { signal: new AbortController().signal },
      ),
    ).toEqual({
      count: 2,
    });
    expect(received).toEqual({ count: 2 });
  });

  it("rejects parse failures before invoking the handler, including unknown keys", async () => {
    let invoked = false;
    const tool = defineTool({
      name: "strict",
      description: "Strict",
      input: z.strictObject({ value: z.string() }),
      handler: () => {
        invoked = true;
        return { ok: true };
      },
    });

    await expect(
      tool.handler(
        { value: "ok", extra: true },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow();
    expect(invoked).toBe(false);
  });

  it("preserves default z.object unknown-key behavior at the transport boundary", () => {
    const input = z.object({
      value: z.string(),
      limit: z.number().default(3),
    });
    const tool = defineTool({
      name: "default-object",
      description: "Default object",
      input,
      handler: (parsed) => parsed,
    });
    const validate = compileInputSchema(tool.inputSchema);
    for (const candidate of [
      { value: "ok" },
      { value: "ok", extra: true },
      { value: 1, extra: true },
      { value: "ok", limit: "bad" },
    ]) {
      const transportAccepted = validate(candidate);
      const zodAccepted = input.safeParse(candidate).success;
      expect(transportAccepted).toBe(zodAccepted);
    }
    expect(
      tool.handler(
        { value: "ok", extra: true },
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({ value: "ok", limit: 3 });
  });

  it("does not make permissive union branches strict", () => {
    const input = z.union([
      z.object({ kind: z.literal("open"), value: z.string() }),
      z.strictObject({ kind: z.literal("strict"), value: z.string() }),
    ]);
    const schema = defineTool({
      name: "union",
      description: "Union",
      input,
      handler: (parsed) => parsed,
    }).inputSchema;
    const validate = compileInputSchema(schema);
    for (const candidate of [
      { kind: "open", value: "ok", extra: true },
      { kind: "strict", value: "ok", extra: true },
    ]) {
      expect(validate(candidate)).toBe(input.safeParse(candidate).success);
    }
  });

  it("preserves catchall union branches", () => {
    const input = z.union([
      z
        .object({ kind: z.literal("catchall"), value: z.string() })
        .catchall(z.number()),
      z.strictObject({ kind: z.literal("strict"), value: z.string() }),
    ]);
    const schema = defineTool({
      name: "catchall-union",
      description: "Catchall union",
      input,
      handler: (parsed) => parsed,
    }).inputSchema;
    const validate = compileInputSchema(schema);
    for (const candidate of [
      { kind: "catchall", value: "ok", extra: 1 },
      { kind: "catchall", value: "ok", extra: "nope" },
      { kind: "strict", value: "ok", extra: true },
    ]) {
      expect(validate(candidate)).toBe(input.safeParse(candidate).success);
    }
  });

  it("parses Zod formats before invoking a typed handler", async () => {
    let invoked = false;
    const tool = defineTool({
      name: "url",
      description: "URL",
      input: z.strictObject({ value: z.string().url() }),
      handler: () => {
        invoked = true;
        return { ok: true };
      },
    });
    // Ajv intentionally has format validation disabled for the shared wire
    // boundary; the Zod parse remains the application-level validation.
    expect(compileInputSchema(tool.inputSchema)({ value: "not a URL" })).toBe(
      true,
    );
    await expect(
      tool.handler(
        { value: "not a URL" },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow();
    expect(invoked).toBe(false);
  });

  it("keeps valid typed output compatible with the bridge normalizer", async () => {
    const tool = defineTool({
      name: "output",
      description: "Output",
      input: z.strictObject({}),
      handler: () => ({ ok: true }),
    });
    const result = normalizeResult(
      await tool.handler({}, { signal: new AbortController().signal }),
    );
    expect(result.content[0]).toEqual({ type: "text", text: '{"ok":true}' });
  });

  it("does not silently advertise unsupported transforms or refinements", () => {
    expect(() =>
      defineTool({
        name: "transform",
        description: "Transform",
        input: z.strictObject({ value: z.string().transform(String) }),
        handler: () => ({ ok: true }),
      }),
    ).toThrow(/unsupported Zod/);
    expect(() =>
      defineTool({
        name: "refine",
        description: "Refine",
        input: z.strictObject({ value: z.string().refine(Boolean) }),
        handler: () => ({ ok: true }),
      }),
    ).toThrow(/unsupported Zod/);
  });
});
