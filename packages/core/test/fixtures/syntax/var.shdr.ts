import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  var value = uniforms.time;
  return vec4(value, coord.x, 0, 1);
});
