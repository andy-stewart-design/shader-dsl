import { defineShaderFunction, dFdx, dFdy, fwidth } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

export const fragmentDerivativeHelper = defineShaderFunction(
  (value: Expr<Vec2<F32>>) => dFdx(value.x) + dFdy(value.y) + fwidth(value.x),
);
