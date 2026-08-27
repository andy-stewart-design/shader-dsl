import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(async ({ coord, uniforms }) => {
  return vec4(coord.x, coord.y, uniforms.time, uniforms.time);
});
