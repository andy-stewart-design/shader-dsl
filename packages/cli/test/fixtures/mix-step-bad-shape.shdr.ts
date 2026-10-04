import { createFragmentShader, mix, step, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const wrong = mix(coord.xy, coord.xyz, uniforms.time);
  return vec4(wrong, 1);
});
