import { createFragmentShader, vec4 } from "shdr";
import { preserveColor } from "./shared/gradient-helper.shdr.ts";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const color = vec4(uv.x, uv.y, 0, 1);

  return preserveColor(color);
});
