import { z } from "zod";
import type {
  BridgeResult,
  BridgeTool,
  JsonObject,
  JsonValue,
} from "./protocol.js";

export { z } from "zod";

export type BridgeToolContext = { readonly signal: AbortSignal };
export type BridgeToolOutput = JsonValue | BridgeResult;

type SchemaDefinition = z.ZodType;

type ToolHandler<Schema extends SchemaDefinition> = (
  input: z.output<Schema>,
  context: BridgeToolContext,
) => BridgeToolOutput | Promise<BridgeToolOutput>;

export type DefineToolOptions<Schema extends SchemaDefinition> = {
  readonly name: string;
  readonly description: string;
  readonly input: Schema;
  readonly handler: ToolHandler<Schema>;
};

/**
 * Convert a Zod input schema to the JSON Schema dialect used by the bridge.
 *
 * Custom refinements and transforms are rejected rather than silently omitted
 * from the advertised transport schema. Built-in checks such as min, max,
 * regex, and literals are representable and are retained.
 */
export function toJsonSchema(schema: SchemaDefinition): JsonObject {
  try {
    const generated = z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io: "input",
      unrepresentable: "throw",
      override: ({ zodSchema }) => {
        assertRepresentable(zodSchema);
      },
    });
    if (!isJsonObject(generated))
      throw new Error("input schema did not produce a JSON object schema");
    return generated as JsonObject;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("unsupported Zod"))
      throw error;
    throw new Error(
      `unsupported Zod input schema: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Define a typed bridge tool with generated transport validation. */
export function defineTool<Schema extends SchemaDefinition>(
  options: DefineToolOptions<Schema>,
): BridgeTool {
  const inputSchema = toJsonSchema(options.input);
  return {
    name: options.name,
    description: options.description,
    inputSchema,
    handler: async (rawInput, context) =>
      options.handler(options.input.parse(rawInput), context),
  };
}

function assertRepresentable(schema: unknown): void {
  const definition = (
    schema as {
      _zod?: {
        def?: {
          type?: unknown;
          checks?: readonly { _zod?: { def?: { type?: unknown } } }[];
        };
      };
    }
  )._zod?.def;
  if (definition?.type === "pipe" || definition?.type === "transform") {
    throw new Error("unsupported Zod transform or pipe");
  }
  if (definition?.checks?.some((check) => check._zod?.def?.type === "custom")) {
    throw new Error("unsupported Zod refinement");
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
