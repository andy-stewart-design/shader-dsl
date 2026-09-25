import { createFragmentShader, vec2, vec3, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const probe = uniforms.time * uniforms.time;
  const uv = vec2(coord.x, coord.y) / uniforms.resolution;
  const copy = vec2(uv);
  const repeated = copy.xxyy;
  const rgb = vec3(repeated.x, repeated.z, 0);
  const shifted = -vec3(rgb) + vec3(1);
  const scaled = (shifted * 0.5) / 1;
  const reordered = scaled.zyx;
  return vec4(reordered.x, reordered.y, reordered.z, 1);
});
