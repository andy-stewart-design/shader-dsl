import { createFragmentShader, vec4 } from "other-shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  return vec4(coord.x, coord.y, uniforms.time, uniforms.time);
});
