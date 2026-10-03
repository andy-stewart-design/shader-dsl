import { defineUniforms, vec4 } from "shdr";

export default defineUniforms((u) => ({
  color: u.vec3(0.2, 0.4, 0.6),
  gain: u.f32(0.25),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color.x, uniforms.color.y, uniforms.gain, uniforms.color.z),
);
