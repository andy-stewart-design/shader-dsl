import { shaderSourceWasNotTransformed } from "./runtime-error.js";
import type {
  Expr,
  F32,
  FragmentContext,
  FragmentShaderSource,
  Vec2,
  Vec3,
  Vec4,
} from "./types.js";

export function createFragmentShader(
  _callback: (context: FragmentContext) => Expr<Vec4<F32>>,
): FragmentShaderSource {
  return shaderSourceWasNotTransformed("createFragmentShader");
}

export function vec2(x: Expr<F32>, y: Expr<F32>): Expr<Vec2<F32>>;
export function vec2(value: Expr<F32>): Expr<Vec2<F32>>;
export function vec2(value: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function vec2(..._arguments: readonly unknown[]): Expr<Vec2<F32>> {
  return shaderSourceWasNotTransformed("vec2");
}

export function vec3(x: Expr<F32>, y: Expr<F32>, z: Expr<F32>): Expr<Vec3<F32>>;
export function vec3(value: Expr<F32>): Expr<Vec3<F32>>;
export function vec3(value: Expr<Vec3<F32>>): Expr<Vec3<F32>>;
export function vec3(..._arguments: readonly unknown[]): Expr<Vec3<F32>> {
  return shaderSourceWasNotTransformed("vec3");
}

export function vec4(
  x: Expr<F32>,
  y: Expr<F32>,
  z: Expr<F32>,
  w: Expr<F32>,
): Expr<Vec4<F32>>;
export function vec4(
  xy: Expr<Vec2<F32>>,
  z: Expr<F32>,
  w: Expr<F32>,
): Expr<Vec4<F32>>;
export function vec4(value: Expr<F32>): Expr<Vec4<F32>>;
export function vec4(value: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function vec4(..._arguments: readonly unknown[]): Expr<Vec4<F32>> {
  return shaderSourceWasNotTransformed("vec4");
}
