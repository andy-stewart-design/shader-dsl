// Type-check-only authored module: the draft signatures do not execute.
import { vec4 } from "../../../packages/shdr/src/index.js";
import { defineUniforms } from "../contract-draft.js";

export default defineUniforms((u) => ({
  color: u.vec3(0, 0, 1),
  dpi: u.f32(12),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color.x, uniforms.color.y, uniforms.dpi, uniforms.dpi),
);
