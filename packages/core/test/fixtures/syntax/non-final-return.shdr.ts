import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  return vec4(coord.x, coord.y, 0, 1);
  const value = uniforms.time;
});
