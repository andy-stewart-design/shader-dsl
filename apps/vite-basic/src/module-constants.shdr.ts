import { createFragmentShader, vec2, vec4 } from "shdr";

const RADIUS = 0.125;
const CENTER = vec2(0.25, 0.5);

export default createFragmentShader(({ coord }) =>
  vec4((coord.x / 200) * RADIUS, (coord.y / 160) * CENTER.y, CENTER.x, 1),
);
