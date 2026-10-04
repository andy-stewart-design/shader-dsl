import { createFragmentShader, mix, step, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const scalar = mix(s, s, s) + step(s, s);
  const pair = mix(v2, v2, s) + mix(v2, v2, v2) + step(v2, v2) + step(s, v2);
  const triplet = mix(v3, v3, s) + mix(v3, v3, v3) + step(v3, v3) + step(s, v3);
  const quad = mix(v4, v4, s) + mix(v4, v4, v4) + step(v4, v4) + step(s, v4);
  return quad + vec4(triplet, scalar) + vec4(pair.x, pair.y, 0, 0);
});
