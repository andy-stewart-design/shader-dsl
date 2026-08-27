import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const { x } = coord;
  return vec4(x, uniforms.time, 0, 1);
});
