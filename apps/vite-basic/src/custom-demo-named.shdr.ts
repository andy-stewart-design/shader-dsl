import { createFragmentShader, defineUniforms, vec4 } from "shdr";

const uniforms = defineUniforms((u) => ({
  color: u.vec3(0.6, 0.2, 0.4),
  gain: u.f32(0.75),
}));

export default createFragmentShader(
  ({ uniforms }) =>
    vec4(uniforms.color.x, uniforms.color.y, uniforms.gain, uniforms.color.z),
  { uniforms },
);
