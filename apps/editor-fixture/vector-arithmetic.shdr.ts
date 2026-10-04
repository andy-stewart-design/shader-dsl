import { createFragmentShader, vec3, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.rg / uniforms.resolution;
  const rgb = vec3(uv, 0.6);
  return vec4((1 - rgb + 0.1).bgr, 1);
});
