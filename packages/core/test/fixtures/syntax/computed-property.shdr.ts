import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const value = coord["x"];
  return vec4(value, uniforms.time, 0, 1);
});
