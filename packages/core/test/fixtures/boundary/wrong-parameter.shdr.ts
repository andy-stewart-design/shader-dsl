import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ mouse }) => {
  return vec4(mouse.x, mouse.y, 0, 1);
});
