import { z } from "zod";
import {
  isJsonValue,
  isRecord,
  type BridgeResult,
  type BridgeTool,
  type JsonCompatible,
  type JsonObject,
  type JsonValue,
} from "./protocol.js";

export { z } from "zod";

export type BridgeToolContext = { readonly signal: AbortSignal };
export type BridgeToolOutput = JsonValue | BridgeResult;

type SchemaDefinition = z.ZodType;

type JsonOutput<Output> = JsonCompatible<Output>;
type AnyOutputGuard<Output> =
  IsAny<Output> extends true
    ? { readonly __jsonOutputMustBeSerializable: never }
    : unknown;
type IsAny<Output> = 0 extends 1 & Output ? true : false;

type ToolHandler<Schema extends SchemaDefinition, Output> = ((
  input: z.output<Schema>,
  context: BridgeToolContext,
) => Output | Promise<Output>) &
  ((
    input: z.output<Schema>,
    context: BridgeToolContext,
  ) => JsonOutput<Output> | Promise<JsonOutput<Output>>);

export type DefineToolOptions<
  Schema extends SchemaDefinition,
  Output = BridgeToolOutput,
> = {
  readonly name: string;
  readonly description: string;
  readonly input: Schema;
  readonly handler: ToolHandler<Schema, Output>;
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
    return generated;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("unsupported Zod"))
      throw error;
    throw new Error(
      `unsupported Zod input schema: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Define a typed bridge tool with generated transport validation. */
export function defineTool<Schema extends SchemaDefinition, Output>(
  options: DefineToolOptions<Schema, Output> & AnyOutputGuard<NoInfer<Output>>,
): BridgeTool<Output> {
  const inputSchema = toJsonSchema(options.input);
  return {
    name: options.name,
    description: options.description,
    inputSchema,
    handler: async (rawInput, context) =>
      Promise.resolve(options.handler(options.input.parse(rawInput), context)),
  };
}

function assertRepresentable(schema: z.core.$ZodType) {
  const definition = schema._zod.def;
  if (definition?.type === "pipe" || definition?.type === "transform") {
    throw new Error("unsupported Zod transform or pipe");
  }
  if (definition.checks?.some((check) => check._zod.def.check === "custom")) {
    throw new Error("unsupported Zod refinement");
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}
