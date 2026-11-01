import type { Uniform } from "../../shared/uniforms";
import { colorToValidHex } from "../uniforms-pane/helpers.ts";
type RuntimePatchValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number];
type UniformPatch = Readonly<Record<string, RuntimePatchValue>>;

export type RuntimeUniform =
  | {
      readonly name: string;
      readonly type: "float";
      readonly defaultValue: number;
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly name: string;
      readonly type: "color";
      readonly defaultValue: string;
    };

export type RuntimeUniformValue = number | string;
export type RuntimeUniformValues = Readonly<Record<string, RuntimeUniformValue>>;

const F32_MAX = Math.fround(3.4028234663852886e38);

function isFiniteFloat32(value: number): boolean {
  return Number.isFinite(value) && Number.isFinite(Math.fround(value));
}

function finiteFloat(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return isFiniteFloat32(parsed) ? parsed : undefined;
}

function boundedFloat32(value: number): number {
  return Math.max(-F32_MAX, Math.min(F32_MAX, value));
}

function fallbackRange(value: number): { min: number; max: number } {
  const distance = Math.max(1, Math.abs(value) * 0.1);
  const min = boundedFloat32(value - distance);
  const max = boundedFloat32(value + distance);
  if (isFiniteFloat32(min) && isFiniteFloat32(max) && min < max)
    return { min, max };
  // Keep the control finite even for values near the largest f32 magnitude.
  return value >= 0
    ? { min: 0, max: value || 1 }
    : { min: value, max: 0 };
}

/** Builds controls only from the uniform snapshot that was successfully applied. */
export function toRuntimeUniforms(
  uniforms: readonly Uniform[],
): readonly RuntimeUniform[] {
  return uniforms.flatMap((uniform): RuntimeUniform[] => {
    if (uniform.type === "float") {
      const defaultValue = finiteFloat(uniform.value);
      if (defaultValue === undefined) return [];

      const draftMin = finiteFloat(uniform.min);
      const draftMax = finiteFloat(uniform.max);
      const range =
        draftMin !== undefined &&
        draftMax !== undefined &&
        draftMin < draftMax
          ? { min: Math.min(draftMin, defaultValue), max: Math.max(draftMax, defaultValue) }
          : fallbackRange(defaultValue);
      return [{
        name: uniform.name,
        type: "float",
        defaultValue,
        min: range.min,
        max: range.max,
      }];
    }

    const defaultValue = colorToValidHex(uniform.draft);
    return defaultValue
      ? [{ name: uniform.name, type: "color", defaultValue }]
      : [];
  });
}

export function defaultRuntimeValues(
  uniforms: readonly RuntimeUniform[],
): RuntimeUniformValues {
  return Object.fromEntries(
    uniforms.map((uniform) => [uniform.name, uniform.defaultValue]),
  );
}

export function runtimeValuesToPatch(
  uniforms: readonly RuntimeUniform[],
  values: RuntimeUniformValues,
): UniformPatch {
  const patch: Record<string, RuntimePatchValue> = {};
  for (const uniform of uniforms) {
    const value = values[uniform.name];
    if (
      uniform.type === "float" &&
      typeof value === "number" &&
      isFiniteFloat32(value)
    ) {
      patch[uniform.name] = value;
    } else if (uniform.type === "color" && typeof value === "string") {
      const hex = colorToValidHex(value);
      if (hex) {
        const rgb = Number.parseInt(hex.slice(1), 16);
        patch[uniform.name] = [
          ((rgb >> 16) & 0xff) / 255,
          ((rgb >> 8) & 0xff) / 255,
          (rgb & 0xff) / 255,
        ];
      }
    }
  }
  return patch;
}
