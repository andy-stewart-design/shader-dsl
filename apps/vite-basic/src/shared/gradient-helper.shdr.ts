import { defineShaderFunction, vec4 } from "shdr";
import type { Expr, F32, Vec4 } from "shdr";

export const preserveColor = defineShaderFunction((color: Expr<Vec4<F32>>) =>
  vec4(color.r, color.g, color.b, color.a),
);
