import { colorToValidHex } from "../components/uniforms-pane/helpers.ts";
import { toShaderUniformDefinitions } from "../components/uniforms-pane/definitions.ts";
import type { Uniform } from "../shared/uniforms.ts";

export interface FloatUniformDefinitionInput {
  readonly id?: string;
  readonly name: string;
  readonly type: "float";
  /** The editable definition default, not a live runtime value. */
  readonly value: string;
  readonly min: string;
  readonly max: string;
}

export interface ColorUniformDefinitionInput {
  readonly id?: string;
  readonly name: string;
  readonly type: "color";
  /** The editable definition default, not a live runtime value. */
  readonly value: string;
}

export type UniformDefinitionInput =
  FloatUniformDefinitionInput | ColorUniformDefinitionInput;

export interface AuthoringUpdateInput {
  readonly expectedRevision: number;
  readonly main?: string;
  readonly utils?: string;
  readonly uniforms?: readonly UniformDefinitionInput[];
}

/** JSON Schema advertised for the internal authoring command boundary. */
export const authoringUpdateJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["expectedRevision"],
  properties: {
    expectedRevision: { type: "integer" },
    main: { type: "string" },
    utils: { type: "string" },
    uniforms: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["name", "type", "value", "min", "max"],
            properties: {
              id: { type: "string", minLength: 1 },
              name: { type: "string" },
              type: { const: "float" },
              value: { type: "string" },
              min: { type: "string" },
              max: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["name", "type", "value"],
            properties: {
              id: { type: "string", minLength: 1 },
              name: { type: "string" },
              type: { const: "color" },
              value: { type: "string" },
            },
          },
        ],
      },
    },
  },
} as const;

export interface NormalizedUniforms {
  readonly ok: true;
  readonly uniforms: Uniform[];
}

export interface InvalidUniforms {
  readonly ok: false;
  readonly error: string;
}

export type NormalizeUniformsResult = NormalizedUniforms | InvalidUniforms;

/** Converts the store's raw draft fields to the published definition shape. */
export function readUniformDefinitions(
  uniforms: readonly Uniform[],
): UniformDefinitionInput[] {
  return uniforms.map((uniform) =>
    uniform.type === "float"
      ? {
          id: uniform.id,
          name: uniform.name,
          type: "float",
          value: uniform.value,
          min: uniform.min,
          max: uniform.max,
        }
      : {
          id: uniform.id,
          name: uniform.name,
          type: "color",
          value: uniform.draft,
        },
  );
}

/**
 * Validates and normalizes a complete replacement list before it reaches the
 * store. Existing IDs are accepted only when they belong to the current list;
 * omitted IDs reuse an existing same-name ID, otherwise a fresh ID is made.
 */
export function normalizeUniformDefinitions(
  input: unknown,
  existing: readonly Uniform[],
): NormalizeUniformsResult {
  if (!Array.isArray(input)) return invalid("uniforms must be an array.");

  const existingById = new Map(
    existing.map((uniform) => [uniform.id, uniform]),
  );
  const existingByName = new Map<string, Uniform[]>();
  for (const uniform of existing) {
    const matches = existingByName.get(uniform.name) ?? [];
    matches.push(uniform);
    existingByName.set(uniform.name, matches);
  }

  const usedIds = new Set<string>();
  const usedExistingIds = new Set<string>();
  const drafts: Uniform[] = [];
  let nextId = 0;

  for (const item of input) {
    if (!isRecord(item)) return invalid("Each uniform must be an object.");
    const idResult = readOptionalString(item, "id");
    if (!idResult.ok) return invalid("Uniform id must be a non-empty string.");
    const name = item.name;
    if (typeof name !== "string")
      return invalid("Uniform name must be a string.");
    const type = item.type;

    let id: string;
    if (idResult.value !== undefined) {
      id = idResult.value;
      if (!existingById.has(id)) {
        return invalid(`Uniform id ${JSON.stringify(id)} is unknown.`);
      }
      if (usedIds.has(id))
        return invalid(`Duplicate uniform id ${JSON.stringify(id)}.`);
      usedExistingIds.add(id);
    } else {
      const sameName = existingByName
        .get(name)
        ?.find((uniform) => !usedExistingIds.has(uniform.id));
      if (sameName) {
        id = sameName.id;
        usedExistingIds.add(id);
      } else {
        do {
          id = `uniform-${nextId}`;
          nextId += 1;
        } while (usedIds.has(id) || existingById.has(id));
      }
    }
    usedIds.add(id);

    if (type === "float") {
      if (
        !hasOnlyKeys(item, ["id", "name", "type", "value", "min", "max"]) ||
        typeof item.value !== "string" ||
        typeof item.min !== "string" ||
        typeof item.max !== "string"
      ) {
        return invalid(
          "Float uniforms require string value, min, and max fields.",
        );
      }
      drafts.push({
        id,
        name,
        type,
        value: item.value,
        min: item.min,
        max: item.max,
      });
    } else if (type === "color") {
      if (
        !hasOnlyKeys(item, ["id", "name", "type", "value"]) ||
        typeof item.value !== "string"
      ) {
        return invalid("Color uniforms require a string value field.");
      }
      drafts.push({
        id,
        name,
        type,
        draft: item.value,
        valid: colorToValidHex(item.value) ?? "",
      });
    } else {
      return invalid('Uniform type must be "float" or "color".');
    }
  }

  const definitions = toShaderUniformDefinitions(drafts);
  if (!definitions.ok) return invalid(definitions.error);
  return { ok: true, uniforms: drafts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function readOptionalString(
  value: Record<string, unknown>,
  key: string,
):
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false } {
  if (!(key in value)) return { ok: true, value: undefined };
  return typeof value[key] === "string" && value[key] !== ""
    ? { ok: true, value: value[key] }
    : { ok: false };
}

function invalid(error: string): InvalidUniforms {
  return { ok: false, error };
}
