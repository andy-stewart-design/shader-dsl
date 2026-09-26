import { createFragmentShader, vec4 } from "shdr";

const ordinaryOutside: string = 123;

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;

  return vec4(uv.x, uv.y, 0, 1);
});
