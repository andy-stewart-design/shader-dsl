// Same names/types as inline.shdr.ts, but different defaults.
import {
  createFragmentShader,
  defineUniforms,
  vec4,
} from "../../../../packages/shdr/src/index.js";

const uniforms = defineUniforms((u) => ({
  color: u.vec3(1, 0, 0),
  dpi: u.f32(24),
}));

export default createFragmentShader(
  ({ uniforms }) =>
    vec4(uniforms.color.x, uniforms.color.y, uniforms.dpi, uniforms.dpi),
  { uniforms },
);
