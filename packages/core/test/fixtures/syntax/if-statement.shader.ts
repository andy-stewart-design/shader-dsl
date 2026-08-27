import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  if (uniforms.time) {
    const value = 1;
  }
  return vec4(coord.x, coord.y, 0, 1);
});
