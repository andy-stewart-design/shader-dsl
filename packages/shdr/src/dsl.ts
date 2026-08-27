import { shaderSourceWasNotTransformed } from "./runtime-error.js";
import type {
  Expr,
  F32,
  FragmentContext,
  FragmentShaderSource,
  Vec4,
} from "./types.js";

export function createFragmentShader(
  _callback: (context: FragmentContext) => Expr<Vec4<F32>>,
): FragmentShaderSource {
  return shaderSourceWasNotTransformed("createFragmentShader");
}

export function vec4(
  _x: Expr<F32>,
  _y: Expr<F32>,
  _z: Expr<F32>,
  _w: Expr<F32>,
): Expr<Vec4<F32>> {
  return shaderSourceWasNotTransformed("vec4");
}
