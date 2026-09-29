import { ceil, createFragmentShader, cross, distance, vec3, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy;
  const rounded = ceil(uv);
  const separation = distance(rounded, uv);
  const normal = cross(vec3(1, 0, 0), vec3(0, 1, 0));
  return vec4(separation, normal.z, ceil(uniforms.time), 1);
});
