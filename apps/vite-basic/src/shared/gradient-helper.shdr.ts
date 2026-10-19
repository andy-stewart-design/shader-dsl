import { defineShaderFunction, vec4 } from "shdr";
import type { Expr, F32, Vec4 } from "shdr";

const COLOR_BIAS = 0;
export const preserveColor = defineShaderFunction((color: Expr<Vec4<F32>>) =>
  vec4(color.r + COLOR_BIAS, color.g, color.b, color.a),
);
