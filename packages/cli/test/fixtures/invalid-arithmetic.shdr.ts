import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const broken = coord.xy + uniforms.time;
  return vec4(coord);
});
