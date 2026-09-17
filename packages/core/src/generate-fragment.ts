import { generateGlslFragment } from "./generate-glsl-fragment.js";
import { generateWgslFragment } from "./generate-wgsl-fragment.js";
import type { ShaderModule } from "./shader-ir.js";

export type ShaderTarget = "glsl-es-300" | "wgsl";

/** Generates one target from an existing target-neutral typed IR module. */
export function generateFragment(
  ir: ShaderModule,
  target: ShaderTarget,
): string {
  switch (target) {
    case "glsl-es-300":
      return generateGlslFragment(ir);
    case "wgsl":
      return generateWgslFragment(ir);
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
