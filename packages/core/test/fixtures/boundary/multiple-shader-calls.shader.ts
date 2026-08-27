import { createFragmentShader, vec4 } from "shdr";

createFragmentShader(({ coord, uniforms }) => {
  return vec4(coord.x, coord.y, uniforms.time, uniforms.time);
});

export default createFragmentShader(({ coord, uniforms }) => {
  return vec4(coord.x, coord.y, uniforms.time, uniforms.time);
});
