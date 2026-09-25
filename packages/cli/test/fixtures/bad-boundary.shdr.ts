import { vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  return vec4(uv.x, uv.y, 0, 1);
});
