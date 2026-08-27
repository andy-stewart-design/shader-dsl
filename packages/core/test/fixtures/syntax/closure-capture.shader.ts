import { createFragmentShader, vec4 } from "shdr";

const scale = 2;

export default createFragmentShader(({ coord, uniforms }) => {
  const value = uniforms.time / scale;
  return vec4(value, coord.x, 0, 1);
});
