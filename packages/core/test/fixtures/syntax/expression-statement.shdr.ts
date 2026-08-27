import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  vec4(coord.x, uniforms.time, 0, 1);
  return vec4(coord.x, coord.y, 0, 1);
});
