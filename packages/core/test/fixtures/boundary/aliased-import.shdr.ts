import { createFragmentShader as createShader, vec4 } from "shdr";

export default createShader(({ coord, uniforms }) => {
  return vec4(coord.x, coord.y, uniforms.time, uniforms.time);
});
