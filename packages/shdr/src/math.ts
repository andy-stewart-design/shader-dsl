import { shaderSourceWasNotTransformed } from "./runtime-error.js";
import type { Expr, F32, Vec2, Vec3, Vec4 } from "./types.js";

export function sin(x: Expr<F32>): Expr<F32>;
export function sin(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function sin(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function sin(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function sin(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("sin");
}

export function cos(x: Expr<F32>): Expr<F32>;
export function cos(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function cos(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function cos(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function cos(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("cos");
}

export function smoothstep(
  edge0: Expr<F32>,
  edge1: Expr<F32>,
  x: Expr<F32>,
): Expr<F32>;
export function smoothstep(
  edge0: Expr<Vec2<F32>>,
  edge1: Expr<Vec2<F32>>,
  x: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;
export function smoothstep(
  edge0: Expr<Vec3<F32>>,
  edge1: Expr<Vec3<F32>>,
  x: Expr<Vec3<F32>>,
): Expr<Vec3<F32>>;
export function smoothstep(
  edge0: Expr<Vec4<F32>>,
  edge1: Expr<Vec4<F32>>,
  x: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;
export function smoothstep(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("smoothstep");
}

export function abs(x: Expr<F32>): Expr<F32>;
export function abs(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function abs(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function abs(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function abs(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("abs");
}

export function floor(x: Expr<F32>): Expr<F32>;
export function floor(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function floor(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function floor(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function floor(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("floor");
}

export function fract(x: Expr<F32>): Expr<F32>;
export function fract(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function fract(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function fract(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function fract(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("fract");
}

export function min(x: Expr<F32>, y: Expr<F32>): Expr<F32>;
export function min(x: Expr<Vec2<F32>>, y: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function min(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function min(x: Expr<Vec4<F32>>, y: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function min(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("min");
}

export function max(x: Expr<F32>, y: Expr<F32>): Expr<F32>;
export function max(x: Expr<Vec2<F32>>, y: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function max(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function max(x: Expr<Vec4<F32>>, y: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function max(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("max");
}

export function dot(x: Expr<Vec2<F32>>, y: Expr<Vec2<F32>>): Expr<F32>;
export function dot(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<F32>;
export function dot(x: Expr<Vec4<F32>>, y: Expr<Vec4<F32>>): Expr<F32>;
export function dot(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("dot");
}

export function length(x: Expr<F32>): Expr<F32>;
export function length(x: Expr<Vec2<F32>>): Expr<F32>;
export function length(x: Expr<Vec3<F32>>): Expr<F32>;
export function length(x: Expr<Vec4<F32>>): Expr<F32>;
export function length(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("length");
}

export function normalize(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function normalize(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function normalize(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function normalize(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("normalize");
}
