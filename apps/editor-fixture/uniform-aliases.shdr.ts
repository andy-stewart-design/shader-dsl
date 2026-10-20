import { createFragmentShader, defineUniforms, vec4 } from "shdr";

const uniforms = defineUniforms((u) => ({ gain: u.f32(0.5) }));

export default createFragmentShader(
  ($) => {
    const u = $.u;
    const alias = u;
    return vec4(alias.gain, $.uniforms.gain, $.coord.x, 1);
  },
  { uniforms },
);
