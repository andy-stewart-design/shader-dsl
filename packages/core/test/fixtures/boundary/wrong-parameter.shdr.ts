import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord }) => {
  return vec4(coord.x, coord.y, 0, 1);
});
