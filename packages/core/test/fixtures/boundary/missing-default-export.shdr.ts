import { createFragmentShader, vec4 } from "shdr";

const shader = createFragmentShader(({ coord, uniforms }) => {
  return vec4(coord.x, coord.y, uniforms.time, uniforms.time);
});

export { shader };
