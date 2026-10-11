import { clamp, defineShaderFunction, sqrt, vec3 } from "shdr";
import type { Expr, F32, Vec2, Vec3 } from "shdr";

export const guardedAmount = defineShaderFunction((value: Expr<F32>) =>
  sqrt(clamp(value, 0, 1)),
);

export const composedColor = defineShaderFunction(
  (uv: Expr<Vec2<F32>>, gain: Expr<F32>): Expr<Vec3<F32>> => {
    const amount = guardedAmount(uv.x * gain);
    return vec3(amount, uv.y, gain);
  },
);
