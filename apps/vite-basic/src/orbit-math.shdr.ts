import {
  acos,
  asin,
  atan,
  createFragmentShader,
  degrees,
  fract,
  mod,
  radians,
  vec2,
  vec3,
  vec4,
} from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const centered = uv * 2 - 1;
  const s = centered.x;
  const v2 = centered;
  const v3 = vec3(centered, 0);
  const v4 = vec4(v3, 1);
  const axis = vec2(1);
  const binary = atan(v2, axis);
  const helper = atan(v2);
  const inverse = asin(v2) + acos(v2);
  const converted = degrees(radians(v3));
  const wrapped = mod(v4, -1.5);

  return vec4(
    0.5 + inverse.x * 0.1 + atan(s) * 0.05 + binary.x * 0.05,
    converted.x * 0.01 + helper.x * 0.05,
    fract(0.5 + wrapped.x * 0.1 + degrees(radians(s)) * 0.01),
    1,
  );
});
