import type { ShaderUniformDefinition } from "../../compiler/uniform-definitions";
import { colorToValidHex } from "./helpers.ts";
import type { Uniform } from "./types.ts";

export type UniformConversionResult =
  | {
      readonly ok: true;
      readonly definitions: readonly ShaderUniformDefinition[];
    }
  | { readonly ok: false; readonly error: string };

/** Converts drafts to the small, compiler-neutral uniform representation. */
export function toShaderUniformDefinitions(
  uniforms: readonly Uniform[],
): UniformConversionResult {
  const names = new Set<string>();
  const definitions: ShaderUniformDefinition[] = [];

  for (const uniform of uniforms) {
    const name = uniform.name;
    if (name.trim() === "") return invalid(`Uniform name is required.`);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return invalid(
        `Uniform name ${JSON.stringify(name)} is not a valid identifier.`,
      );
    }
    if (RESERVED_NAMES.has(name)) {
      return invalid(`Uniform name ${JSON.stringify(name)} is reserved.`);
    }
    if (names.has(name)) {
      return invalid(`Duplicate uniform name ${JSON.stringify(name)}.`);
    }
    names.add(name);

    if (uniform.type === "float") {
      const value = parseF32(uniform.float.value);
      if (value === undefined) {
        return invalid(
          `Uniform ${JSON.stringify(name)} must have a finite f32 value.`,
        );
      }
      definitions.push({ name, type: "f32", default: value });
      continue;
    }

    const color = colorToValidHex(uniform.color.draft);
    if (!color) {
      return invalid(
        `Uniform ${JSON.stringify(name)} must have a valid 3- or 6-digit hex color.`,
      );
    }
    definitions.push({
      name,
      type: "vec3",
      default: colorToRgb(color),
    });
  }

  return { ok: true, definitions };
}

const RESERVED_NAMES = new Set([
  "resolution",
  "mouse",
  "time",
  "__proto__",
  "prototype",
  "constructor",
]);

function parseF32(draft: string): number | undefined {
  if (draft.trim() === "") return undefined;
  const value = Number(draft);
  return Number.isFinite(value) && Number.isFinite(Math.fround(value))
    ? Object.is(value, -0)
      ? 0
      : value
    : undefined;
}

function colorToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  ];
}

function invalid(error: string): UniformConversionResult {
  return { ok: false, error };
}
