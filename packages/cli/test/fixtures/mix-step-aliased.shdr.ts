import { createFragmentShader, mix as interpolate, vec4 } from "shdr";

export default createFragmentShader(({ uniforms }) => {
  const value = interpolate(uniforms.time, uniforms.time, uniforms.time);
  return vec4(value, 0, 0, 1);
});
