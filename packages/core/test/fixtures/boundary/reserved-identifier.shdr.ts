import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const __shdr_internal_value = uniforms.time;
  return vec4(coord.x, coord.y, __shdr_internal_value, uniforms.time);
});
