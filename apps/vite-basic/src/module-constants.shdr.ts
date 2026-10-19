import { createFragmentShader, vec2, vec4 } from "shdr";

const RADIUS = 0.125;
const CENTER = vec2(0, RADIUS);

export default createFragmentShader(({ coord }) =>
  vec4(coord.x * RADIUS, CENTER.x, RADIUS, 1),
);
