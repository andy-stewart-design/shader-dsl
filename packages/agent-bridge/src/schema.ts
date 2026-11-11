import * as AjvModule from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import {
  BRIDGE_PROTOCOL_VERSION,
  LIMITS,
  isJsonValue,
  isRecord,
  jsonSize,
  type BridgeCatalog,
  type CatalogTool,
  type JsonObject,
} from "./protocol.js";

const AjvConstructor = (
  AjvModule as unknown as {
    default: new (options?: object) => {
      compile: (schema: object) => ValidateFunction;
    };
  }
).default;

function makeAjv() {
  return new AjvConstructor({
    allErrors: true,
    strict: false,
    validateFormats: false,
    loadSchema: undefined,
  });
}

function hasExternalReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasExternalReference);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => {
    if (!["$ref", "$dynamicRef", "$recursiveRef"].includes(key))
      return hasExternalReference(child);
    return (
      typeof child !== "string" || (child !== "#" && !child.startsWith("#/"))
    );
  });
}

export function compileInputSchema(schema: unknown): ValidateFunction {
  if (
    !isRecord(schema) ||
    !isJsonValue(schema) ||
    hasExternalReference(schema)
  ) {
    throw new Error(
      "invalid input schema: only local JSON schemas without external references are supported",
    );
  }
  // A fresh validator bounds retained schema state to the current operation.
  return makeAjv().compile(schema);
}

export function validateInput(
  schema: JsonObject,
  input: unknown,
): { ok: true } | { ok: false; message: string } {
  try {
    const validate = compileInputSchema(schema);
    if (validate(input)) return { ok: true };
    const message = (validate.errors ?? [])
      .map(
        (error) =>
          `${error.instancePath || "/"} ${error.message ?? "invalid value"}`,
      )
      .join("; ");
    return {
      ok: false,
      message: message || "input does not match the declared schema",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "invalid input schema",
    };
  }
}

export function validateToolName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 128 &&
    /^[A-Za-z0-9._-]+$/.test(name)
  );
}

/** Pure shared catalog validation used before either side changes its catalog. */
export function validateCatalogTools(
  tools: unknown,
): asserts tools is readonly CatalogTool[] {
  if (!Array.isArray(tools) || tools.length > LIMITS.tools)
    throw new Error("invalid catalog: tool count exceeds the limit");
  if (jsonSize(tools) > LIMITS.catalogBytes)
    throw new Error("catalog exceeds the limit");
  const names = new Set<string>();
  for (const tool of tools) {
    if (
      !isRecord(tool) ||
      !validateToolName(tool.name) ||
      names.has(tool.name) ||
      typeof tool.description !== "string" ||
      !isRecord(tool.inputSchema)
    )
      throw new Error("invalid catalog tool");
    names.add(tool.name);
    if (jsonSize(tool.description) > LIMITS.catalogBytes)
      throw new Error("invalid catalog tool description");
    compileInputSchema(tool.inputSchema);
  }
}

export function validateCatalog(
  value: unknown,
  expectedSessionId?: string,
  expectedVersion?: number,
): asserts value is BridgeCatalog {
  if (
    !isRecord(value) ||
    value.type !== "catalog" ||
    value.protocolVersion !== BRIDGE_PROTOCOL_VERSION ||
    typeof value.sessionId !== "string" ||
    (expectedSessionId !== undefined &&
      value.sessionId !== expectedSessionId) ||
    !Number.isSafeInteger(value.catalogVersion) ||
    (expectedVersion !== undefined && value.catalogVersion !== expectedVersion)
  )
    throw new Error("invalid catalog envelope");
  if (jsonSize(value) > LIMITS.catalogBytes)
    throw new Error("catalog exceeds the limit");
  validateCatalogTools(value.tools);
}
