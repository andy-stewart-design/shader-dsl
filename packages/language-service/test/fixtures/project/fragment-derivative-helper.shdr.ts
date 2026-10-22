import { defineShaderFunction, dFdx, dFdy, fwidth } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

export const derivativeHelper = defineShaderFunction((p: Expr<Vec2<F32>>) =>
  dFdx(p.x) + dFdy(p.y) + fwidth(p.x),
);
