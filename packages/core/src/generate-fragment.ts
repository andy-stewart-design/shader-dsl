import { generateGlslFragmentOutput } from "./generate-glsl-fragment.js";
import { generateWgslFragmentOutput } from "./generate-wgsl-fragment.js";
import type { ShaderDefaultUniform, ShaderModule } from "./shader-ir.js";

export type ShaderTarget = "glsl-es-300" | "wgsl";

/** The emitted source and the uniform fields this backend actually uses. */
export interface GeneratedFragment {
  readonly code: string;
  readonly referencedUniforms: readonly ShaderDefaultUniform[];
  readonly referencedCustomUniforms: readonly string[];
}

/** Generates one target from an existing target-neutral typed IR module. */
export function generateFragment(
  ir: ShaderModule,
  target: ShaderTarget,
): string {
  return generateFragmentOutput(ir, target).code;
}

/** Keep artifact binding metadata tied to actual backend emission. */
export function generateFragmentOutput(
  ir: ShaderModule,
  target: ShaderTarget,
): GeneratedFragment {
  switch (target) {
    case "glsl-es-300":
      return generateGlslFragmentOutput(ir);
    case "wgsl":
      return generateWgslFragmentOutput(ir);
    default:
      return unknownTarget(target);
  }
}

export function validateShaderTarget(target: unknown): ShaderTarget {
  switch (target) {
    case "glsl-es-300":
    case "wgsl":
      return target;
    default:
      return unknownTarget(target);
  }
}

function unknownTarget(target: unknown): never {
  throw new RangeError(
    `Unknown shader target ${JSON.stringify(target)}; expected "glsl-es-300" or "wgsl".`,
  );
}
