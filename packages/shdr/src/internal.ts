import { shaderSourceWasNotTransformed } from "./runtime-error.js";
import type { Expr, F32, Vec2, Vec4 } from "./types.js";

export function __shdr_internal_f32(_value: number): Expr<F32> {
  return shaderSourceWasNotTransformed("__shdr_internal_f32");
}

export function __shdr_internal_div(
  left: Expr<F32>,
  right: Expr<F32>,
): Expr<F32>;
export function __shdr_internal_div(
  left: Expr<Vec2<F32>>,
  right: Expr<F32>,
): Expr<Vec2<F32>>;
export function __shdr_internal_div(
  left: Expr<Vec2<F32>>,
  right: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;
export function __shdr_internal_div(
  left: Expr<Vec4<F32>>,
  right: Expr<F32>,
): Expr<Vec4<F32>>;
export function __shdr_internal_div(
  left: Expr<Vec4<F32>>,
  right: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;
export function __shdr_internal_div(_left: unknown, _right: unknown): never {
  return shaderSourceWasNotTransformed("__shdr_internal_div");
}
