import type { ShaderUniformDefinition } from "../../compiler/uniform-definitions";
import { colorToValidHex, parseF32 } from "./helpers.ts";
import type { Uniform } from "../../shared/uniforms.ts";

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
      const value = parseF32(uniform.value);
      const min = parseF32(uniform.min);
      const max = parseF32(uniform.max);
      if (value === undefined) {
        return invalid(
          `Uniform ${JSON.stringify(name)} must have a finite f32 value.`,
        );
      }
      if (min === undefined) {
        return invalid(
          `Uniform ${JSON.stringify(name)} must have a finite f32 min.`,
        );
      }
      if (max === undefined) {
        return invalid(
          `Uniform ${JSON.stringify(name)} must have a finite f32 max.`,
        );
      }
      if (min >= max) {
        return invalid(
          `Uniform ${JSON.stringify(name)} min must be less than max.`,
        );
      }
      if (value < min || value > max) {
        return invalid(
          `Uniform ${JSON.stringify(name)} value must be within its min and max.`,
        );
      }
      definitions.push({ name, type: "f32", default: value });
      continue;
    }

    const color = colorToValidHex(uniform.draft);
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
