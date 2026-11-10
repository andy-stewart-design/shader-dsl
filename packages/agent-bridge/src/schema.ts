import * as AjvModule from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import { isRecord, type JsonObject } from "./protocol.js";

const AjvConstructor = (AjvModule as unknown as { default: new (options?: object) => { compile: (schema: object) => ValidateFunction } }).default;
const ajv = new AjvConstructor({ allErrors: true, strict: false, validateFormats: false, loadSchema: undefined });

function hasReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasReference);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => key === "$ref" || hasReference(child));
}

export function compileInputSchema(schema: unknown): ValidateFunction {
  if (!isRecord(schema) || hasReference(schema)) {
    throw new Error("invalid input schema: only local JSON schemas without references are supported");
  }
  return ajv.compile(schema);
}

export function validateInput(schema: JsonObject, input: unknown): { ok: true } | { ok: false; message: string } {
  try {
    const validate = compileInputSchema(schema);
    if (validate(input)) return { ok: true };
    const message = (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid value"}`).join("; ");
    return { ok: false, message: message || "input does not match the declared schema" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "invalid input schema" };
  }
}

export function validateToolName(name: unknown): name is string {
  return typeof name === "string" && name.length > 0 && name.length <= 128 && /^[A-Za-z0-9._-]+$/.test(name);
}
