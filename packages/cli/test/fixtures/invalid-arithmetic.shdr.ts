import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const broken = coord.xy + coord.xyz;
  return vec4(coord);
});
