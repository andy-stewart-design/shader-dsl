import { defineShaderFunction, dFdy, fwidth } from "shdr";
import type { Expr, F32 } from "shdr";

export const derivativeHelper = defineShaderFunction((value: Expr<F32>) =>
  fwidth(dFdy(value)),
);
