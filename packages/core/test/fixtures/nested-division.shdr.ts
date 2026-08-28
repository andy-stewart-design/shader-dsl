import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const left = coord.xy / uniforms.resolution / uniforms.time;
  const right = coord.xy / (uniforms.resolution / uniforms.time);
  // prettier-ignore
  const half = (1 / 2) / uniforms.time;

  return vec4(left.x, right.y, half, 1);
});
