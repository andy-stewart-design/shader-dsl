import { colorToValidHex } from "../components/uniforms-pane/helpers.ts";
import type { Uniform } from "../shared/uniforms.ts";

export interface SketchSnapshot {
  name: string;
  main: string;
  utils: string;
  uniforms: Uniform[];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate and copy only the portable, editable fields. */
export function validateSnapshot(value: unknown): SketchSnapshot {
  if (
    !object(value) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    typeof value.main !== "string" ||
    typeof value.utils !== "string" ||
    !Array.isArray(value.uniforms)
  ) {
    throw new Error("Invalid sketch snapshot");
  }
  const ids = new Set<string>();
  const uniforms: Uniform[] = value.uniforms.map((item: unknown) => {
    if (
      !object(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.name !== "string"
    ) {
      throw new Error("Invalid or duplicate uniform ID");
    }
    ids.add(item.id);
    if (
      item.type === "float" &&
      typeof item.value === "string" &&
      typeof item.min === "string" &&
      typeof item.max === "string"
    ) {
      return {
        id: item.id,
        name: item.name,
        type: "float",
        value: item.value,
        min: item.min,
        max: item.max,
      };
    }
    if (
      item.type === "color" &&
      typeof item.draft === "string" &&
      typeof item.valid === "string" &&
      colorToValidHex(item.valid)
    ) {
      return {
        id: item.id,
        name: item.name,
        type: "color",
        draft: item.draft,
        valid: item.valid,
      };
    }
    throw new Error("Invalid uniform shape or fallback color");
  });
  return { name: value.name, main: value.main, utils: value.utils, uniforms };
}

export function decodeSketch(text: string): SketchSnapshot {
  const value: unknown = JSON.parse(text);
  if (!object(value) || value.format !== "shdr-sketch" || value.version !== 1) {
    throw new Error("Unsupported sketch format or version");
  }
  return validateSnapshot(value);
}

export function encodeSketch(snapshot: SketchSnapshot): string {
  return JSON.stringify(
    { format: "shdr-sketch", version: 1, ...validateSnapshot(snapshot) },
    null,
    2,
  );
}
