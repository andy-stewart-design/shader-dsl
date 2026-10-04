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

export function ceil(x: Expr<F32>): Expr<F32>;
export function ceil(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function ceil(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function ceil(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function ceil(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("ceil");
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

export function mix(a: Expr<F32>, b: Expr<F32>, factor: Expr<F32>): Expr<F32>;
export function mix(
  a: Expr<Vec2<F32>>,
  b: Expr<Vec2<F32>>,
  factor: Expr<F32>,
): Expr<Vec2<F32>>;
export function mix(
  a: Expr<Vec2<F32>>,
  b: Expr<Vec2<F32>>,
  factor: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;
export function mix(
  a: Expr<Vec3<F32>>,
  b: Expr<Vec3<F32>>,
  factor: Expr<F32>,
): Expr<Vec3<F32>>;
export function mix(
  a: Expr<Vec3<F32>>,
  b: Expr<Vec3<F32>>,
  factor: Expr<Vec3<F32>>,
): Expr<Vec3<F32>>;
export function mix(
  a: Expr<Vec4<F32>>,
  b: Expr<Vec4<F32>>,
  factor: Expr<F32>,
): Expr<Vec4<F32>>;
export function mix(
  a: Expr<Vec4<F32>>,
  b: Expr<Vec4<F32>>,
  factor: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;
export function mix(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("mix");
}

export function step(edge: Expr<F32>, x: Expr<F32>): Expr<F32>;
export function step(edge: Expr<F32>, x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function step(
  edge: Expr<Vec2<F32>>,
  x: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;
export function step(edge: Expr<F32>, x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function step(
  edge: Expr<Vec3<F32>>,
  x: Expr<Vec3<F32>>,
): Expr<Vec3<F32>>;
export function step(edge: Expr<F32>, x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function step(
  edge: Expr<Vec4<F32>>,
  x: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;
export function step(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("step");
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

export function distance(x: Expr<F32>, y: Expr<F32>): Expr<F32>;
export function distance(x: Expr<Vec2<F32>>, y: Expr<Vec2<F32>>): Expr<F32>;
export function distance(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<F32>;
export function distance(x: Expr<Vec4<F32>>, y: Expr<Vec4<F32>>): Expr<F32>;
export function distance(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("distance");
}

export function cross(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function cross(..._args: readonly unknown[]): never {
  return shaderSourceWasNotTransformed("cross");
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
