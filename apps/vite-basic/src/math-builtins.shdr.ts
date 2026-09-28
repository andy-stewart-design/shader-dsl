import {
  abs,
  cos,
  createFragmentShader,
  dot,
  floor,
  fract,
  length,
  max,
  min,
  normalize,
  sin,
  smoothstep,
  vec2,
  vec4,
} from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const cells = floor(uv * 8);
  const waves = sin(uv * 2) + cos(uv * 3);
  const ripple = length(fract(waves) - vec2(0.5));
  const axis = normalize(vec2(3, 4));
  const light = abs(dot(uv, axis));
  const mask = smoothstep(vec2(0.2), vec2(0.8), uv);
  const stripes = fract(cells.x * 0.17);
  const red = min(max(light * mask.x, 0), 1);
  const green = smoothstep(0.2, 0.8, stripes);
  const blue = min(max(1 - ripple, 0), 1);
  return vec4(red, green * mask.y, blue, 1);
});
