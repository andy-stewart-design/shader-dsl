import { toJsonSchema, z } from "app-mcp/zod";
import { colorToValidHex } from "#/components/uniforms-pane/helpers.ts";
import { toShaderUniformDefinitions } from "#/components/uniforms-pane/definitions.ts";
import type { Uniform } from "#/shared/uniforms.ts";

const floatUniformDefinitionSchema = z.strictObject({
  id: z.string().min(1).optional(),
  name: z.string(),
  type: z.literal("float"),
  /** The editable definition default, not a live runtime value. */
  value: z.string(),
  min: z.string(),
  max: z.string(),
});

const colorUniformDefinitionSchema = z.strictObject({
  id: z.string().min(1).optional(),
  name: z.string(),
  type: z.literal("color"),
  /** The editable definition default, not a live runtime value. */
  value: z.string(),
});

export const uniformDefinitionSchema = z.discriminatedUnion("type", [
  floatUniformDefinitionSchema,
  colorUniformDefinitionSchema,
]);

const updateFields = {
  expectedRevision: z.number().int(),
  main: z.string().optional(),
  utils: z.string().optional(),
  uniforms: uniformDefinitionSchema.array().optional(),
};

// The union expresses the command's requirement that at least one editable
// field be present, while each strict object still permits a multi-field update.
export const authoringUpdateSchema = z.union([
  z.strictObject({ ...updateFields, main: z.string() }),
  z.strictObject({ ...updateFields, utils: z.string() }),
  z.strictObject({
    ...updateFields,
    uniforms: uniformDefinitionSchema.array(),
  }),
]);

export type FloatUniformDefinitionInput = z.infer<
  typeof floatUniformDefinitionSchema
>;
export type ColorUniformDefinitionInput = z.infer<
  typeof colorUniformDefinitionSchema
>;
export type UniformDefinitionInput = z.infer<typeof uniformDefinitionSchema>;
export type AuthoringUpdateInput = z.infer<typeof authoringUpdateSchema>;

/** JSON Schema advertised for the internal authoring command boundary. */
export const authoringUpdateJsonSchema = toJsonSchema(authoringUpdateSchema);

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
  const parsed = uniformDefinitionSchema.array().safeParse(input);
  if (!parsed.success)
    return invalid("Uniforms contain an invalid definition.");

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

  for (const item of parsed.data) {
    let id: string;
    if (item.id !== undefined) {
      id = item.id;
      if (!existingById.has(id)) {
        return invalid(`Uniform id ${JSON.stringify(id)} is unknown.`);
      }
      if (usedIds.has(id))
        return invalid(`Duplicate uniform id ${JSON.stringify(id)}.`);
      usedExistingIds.add(id);
    } else {
      const sameName = existingByName
        .get(item.name)
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

    if (item.type === "float") {
      drafts.push({
        id,
        name: item.name,
        type: item.type,
        value: item.value,
        min: item.min,
        max: item.max,
      });
    } else {
      drafts.push({
        id,
        name: item.name,
        type: item.type,
        draft: item.value,
        valid: colorToValidHex(item.value) ?? "",
      });
    }
  }

  const definitions = toShaderUniformDefinitions(drafts);
  if (!definitions.ok) return invalid(definitions.error);
  return { ok: true, uniforms: drafts };
}

function invalid(error: string): InvalidUniforms {
  return { ok: false, error };
}
