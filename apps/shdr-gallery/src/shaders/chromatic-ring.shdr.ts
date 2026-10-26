import {
  abs,
  atan,
  cos,
  createFragmentShader,
  defineShaderFunction,
  exp,
  length,
  min,
  pow,
  sin,
  vec3,
  vec4,
} from "shdr";
import type { Expr, F32, Vec3 } from "shdr";

const palette = defineShaderFunction(
  (t: Expr<F32>): Expr<Vec3<F32>> =>
    vec3(0.55) + cos((t + vec3(0, 0.33, 0.67)) * 6.28318) * 0.45,
);

export default createFragmentShader(($) => {
  const uv = $.coord.xy / $.u.resolution;
  const shortest = min($.u.resolution.x, $.u.resolution.y);
  const aspect = $.u.resolution / shortest;
  const p = (uv - 0.5) * aspect;
  const radius = length(p);
  const angle = atan(p.y, p.x) / 6.28318 + 0.5;
  const ring = exp(-95 * pow(abs(radius - 0.31), 2));
  const halo = exp(-18 * pow(abs(radius - 0.31), 2));
  const bands = 0.82 + 0.18 * sin(angle * 25.13272 + radius * 42);
  const color = palette(angle + radius * 0.65);

  return vec4(color * (ring * bands * 2 + halo * 0.22), 1);
});
