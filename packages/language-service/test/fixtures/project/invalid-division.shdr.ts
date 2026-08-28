import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const invalid = coord.xy / coord;
  return vec4(invalid.x, invalid.y, 0, 1);
});
