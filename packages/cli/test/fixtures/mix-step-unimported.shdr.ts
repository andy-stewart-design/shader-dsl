import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ uniforms }) => {
  const value = step(uniforms.time, uniforms.time);
  return vec4(value, 0, 0, 1);
});
