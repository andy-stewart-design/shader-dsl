import { createFragmentShader, smoothstep, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const band = smoothstep(0.5, 0.5, coord.x);
  return vec4(band, uniforms.time, 0, 1);
});
