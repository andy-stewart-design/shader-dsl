import { defineUniforms, vec4 } from "shdr";

export default defineUniforms((u) => ({
  color: u.vec3(0, 0, 1),
  dpi: u.f32(12),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color.x, uniforms.color.y, uniforms.dpi, uniforms.dpi),
);
