import { describe, expect, it } from "vitest";
import { normalizeResult } from "../src/results.js";
import { compileInputSchema } from "../src/schema.js";
import type { BridgeResult, BridgeTool } from "../src/protocol.js";
import { defineTool, z } from "../src/zod.js";

// Compile-time inference regression: this block is deliberately never run.
if (false) {
  const emptyInput = z.strictObject({});
  interface NamedOutput {
    readonly ok: boolean;
    readonly optional?: string;
    readonly values: readonly number[];
  }
  type DiscriminatedOutput =
    | { readonly kind: "ok"; readonly value: NamedOutput }
    | { readonly kind: "error"; readonly message: string };

  defineTool({
    name: "inference",
    description: "inference",
    input: z.strictObject({ count: z.number() }),
    handler: (input): NamedOutput => ({
      ok: true,
      optional: input.count.toString(),
      values: [input.count],
    }),
  });
  defineTool({
    name: "discriminated",
    description: "discriminated",
    input: z.strictObject({}),
    handler: (): DiscriminatedOutput => ({ kind: "error", message: "nope" }),
  });
  const asyncNamedTool: BridgeTool<NamedOutput> = defineTool({
    name: "async-inference",
    description: "async-inference",
    input: z.strictObject({}),
    handler: async (): Promise<NamedOutput> => ({
      ok: true,
      values: [1],
    }),
  });
  interface NamedFailure {
    readonly ok: false;
    readonly error: { readonly code: string; readonly message: string };
  }
  type AsyncBridgeOutput = BridgeResult | NamedFailure;
  const asyncBridgeResultTool: BridgeTool<AsyncBridgeOutput> = defineTool({
    name: "async-bridge-result-inference",
    description: "async-bridge-result-inference",
    input: z.strictObject({}),
    handler: async (): Promise<AsyncBridgeOutput> => ({
      ok: false,
      error: { code: "not-ready", message: "not ready" },
    }),
  });
  void asyncNamedTool;
  void asyncBridgeResultTool;
  defineTool({
    name: "envelope",
    description: "envelope",
    input: z.strictObject({}),
    handler: () => ({
      bridgeResultVersion: 1 as const,
      content: [{ type: "text" as const, text: "hello" }],
    }),
  });
  defineTool({
    name: "unknown-output",
    description: "unknown-output",
    input: z.strictObject({}),
    // @ts-expect-error Unknown output cannot be proven JSON-compatible.
    handler: (): unknown => ({ ok: true }),
  });
  defineTool({
    name: "date-output",
    description: "date-output",
    input: z.strictObject({}),
    // @ts-expect-error Dates are not JSON output values.
    handler: () => new Date(),
  });
  defineTool({
    name: "undefined-output",
    description: "undefined-output",
    input: z.strictObject({}),
    // @ts-expect-error Top-level undefined is not a result.
    handler: () => undefined,
  });
  defineTool({
    name: "function-output",
    description: "function-output",
    input: z.strictObject({}),
    // @ts-expect-error Functions are not JSON output values.
    handler: (): (() => string) => () => "not JSON",
  });
  type NestedFunction = { readonly nested: () => string };
  type NestedDate = { readonly nested: Date };
  type NestedUndefined = { readonly nested: undefined };
  type NestedBigint = { readonly nested: bigint };
  type NestedSymbol = { readonly nested: symbol };
  defineTool({
    name: "nested-function",
    description: "",
    input: z.strictObject({}),
    // @ts-expect-error Nested functions are not JSON output values.
    handler: (): NestedFunction => ({ nested: () => "nope" }),
  });
  defineTool({
    name: "nested-date",
    description: "",
    input: z.strictObject({}),
    // @ts-expect-error Nested dates are not JSON output values.
    handler: (): NestedDate => ({ nested: new Date() }),
  });
  defineTool({
    name: "nested-undefined",
    description: "",
    input: z.strictObject({}),
    // @ts-expect-error Nested undefined is not a JSON output value.
    handler: (): NestedUndefined => ({ nested: undefined }),
  });
  defineTool({
    name: "nested-bigint",
    description: "",
    input: z.strictObject({}),
    // @ts-expect-error Nested bigint is not a JSON output value.
    handler: (): NestedBigint => ({ nested: 1n }),
  });
  defineTool({
    name: "nested-symbol",
    description: "",
    input: z.strictObject({}),
    // @ts-expect-error Nested symbols are not JSON output values.
    handler: (): NestedSymbol => ({ nested: Symbol() }),
  });
  defineTool({
    name: "broad-object",
    description: "",
    input: z.strictObject({}),
    // @ts-expect-error Broad object output can hide non-JSON class instances.
    handler: (): object => ({}),
  });
  defineTool({
    name: "empty-object",
    description: "",
    input: z.strictObject({}),
    // @ts-expect-error The empty object type does not prove JSON compatibility.
    handler: (): {} => ({}),
  });
  // @ts-expect-error `any` output bypasses static knowledge and is rejected.
  defineTool({
    name: "any-output",
    description: "",
    input: z.strictObject({}),
    handler: (): any => ({}),
  });
  type UnknownAlias = unknown;
  defineTool({
    name: "unknown-alias",
    description: "",
    input: z.strictObject({}),
    // @ts-expect-error Aliases do not bypass the unknown output check.
    handler: (): UnknownAlias => ({}),
  });
  defineTool<typeof emptyInput, Date>({
    name: "explicit-date",
    description: "",
    input: emptyInput,
    // @ts-expect-error Explicit output parameters do not bypass JSON checking.
    handler: () => new Date(),
  });

  defineTool({
    name: "bad-input-access",
    description: "bad-input-access",
    input: z.strictObject({ count: z.number() }),
    handler: (input) => {
      // @ts-expect-error The callback must not receive raw unknown input.
      return input.missing;
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
