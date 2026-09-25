import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / coord;
  return vec4(uv.x, uv.y, 0, 1);
});
