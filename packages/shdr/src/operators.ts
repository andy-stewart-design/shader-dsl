import { shaderSourceWasNotTransformed } from "./runtime-error.js";
import type { Expr, F32, Vec2, Vec3, Vec4 } from "./types.js";

export function __shdr_internal_add(
  left: Expr<F32>,
  right: Expr<F32>,
): Expr<F32>;
export function __shdr_internal_add(
  left: Expr<Vec2<F32>>,
  right: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;
export function __shdr_internal_add(
  left: Expr<Vec3<F32>>,
  right: Expr<Vec3<F32>>,
): Expr<Vec3<F32>>;
export function __shdr_internal_add(
  left: Expr<Vec4<F32>>,
  right: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;
export function __shdr_internal_add(_left: unknown, _right: unknown): never {
  return shaderSourceWasNotTransformed("__shdr_internal_add");
}

export function __shdr_internal_sub(
  left: Expr<F32>,
  right: Expr<F32>,
): Expr<F32>;
export function __shdr_internal_sub(
  left: Expr<Vec2<F32>>,
  right: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;
export function __shdr_internal_sub(
  left: Expr<Vec3<F32>>,
  right: Expr<Vec3<F32>>,
): Expr<Vec3<F32>>;
export function __shdr_internal_sub(
  left: Expr<Vec4<F32>>,
  right: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;
export function __shdr_internal_sub(_left: unknown, _right: unknown): never {
  return shaderSourceWasNotTransformed("__shdr_internal_sub");
}

export function __shdr_internal_mul(
  left: Expr<F32>,
  right: Expr<F32>,
): Expr<F32>;
export function __shdr_internal_mul(
  left: Expr<Vec2<F32>>,
  right: Expr<F32>,
): Expr<Vec2<F32>>;
export function __shdr_internal_mul(
  left: Expr<Vec2<F32>>,
  right: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;
export function __shdr_internal_mul(
  left: Expr<Vec3<F32>>,
  right: Expr<F32>,
): Expr<Vec3<F32>>;
export function __shdr_internal_mul(
  left: Expr<Vec3<F32>>,
  right: Expr<Vec3<F32>>,
): Expr<Vec3<F32>>;
export function __shdr_internal_mul(
  left: Expr<Vec4<F32>>,
  right: Expr<F32>,
): Expr<Vec4<F32>>;
export function __shdr_internal_mul(
  left: Expr<Vec4<F32>>,
  right: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;
export function __shdr_internal_mul(_left: unknown, _right: unknown): never {
  return shaderSourceWasNotTransformed("__shdr_internal_mul");
}

export function __shdr_internal_neg(value: Expr<F32>): Expr<F32>;
export function __shdr_internal_neg(value: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function __shdr_internal_neg(value: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function __shdr_internal_neg(value: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function __shdr_internal_neg(_value: unknown): never {
  return shaderSourceWasNotTransformed("__shdr_internal_neg");
}
