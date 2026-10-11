import {
  createFragmentShader,
  defineShaderFunction,
  fract,
  sqrt,
  vec3,
  vec4,
} from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

const palette = defineShaderFunction((p: Expr<Vec2<F32>>, seed: Expr<F32>) => {
  const level = grain(p, seed);
  const rgb = vec3(level);
  return rgb + 0.125;
});

export const grain = defineShaderFunction(
  (p: Expr<Vec2<F32>>, seed: Expr<F32>): Expr<F32> =>
    fract(p.x * 0.1031 + p.y * 0.11369 + seed),
);

const root = defineShaderFunction((x: Expr<F32>) => sqrt(x));

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const rgb = palette(uv, root(uniforms.time));
  return vec4(rgb, 1);
});
