import { createFragmentShader, defineUniforms, vec4 } from "shdr";

const uniforms = defineUniforms((u) => ({
  color: u.vec3(1, 0, 0),
  dpi: u.f32(24),
}));

export default createFragmentShader(
  ({ uniforms }) => vec4(uniforms.color.x, uniforms.color.y, uniforms.dpi, 1),
  { uniforms },
);
