import { shaderSourceWasNotTransformed } from "./runtime-error.js";
import type {
  Expr,
  F32,
  FragmentContext,
  CompiledFragmentArtifact,
  Vec2,
  Vec3,
  Vec4,
  Mat2,
  Mat3,
  Mat4,
  UniformBuilder,
  UniformDefinition,
  UniformSchema,
  TypedCompiledFragmentArtifact,
  ShaderFunction,
  ShaderType,
  Texture2D,
} from "./types.js";

export function sample(
  _texture: Texture2D,
  _uv: Expr<Vec2<F32>>,
): Expr<Vec4<F32>> {
  return shaderSourceWasNotTransformed("sample");
}

export function defineShaderFunction<
  Args extends readonly Expr<ShaderType>[],
  Result extends Expr<ShaderType>,
>(_callback: (...args: Args) => Result): ShaderFunction<Args, Result> {
  return shaderSourceWasNotTransformed("defineShaderFunction");
}

export function defineUniforms<const S extends UniformSchema>(
  _callback: (u: UniformBuilder) => S,
): UniformDefinition<S> {
  return shaderSourceWasNotTransformed("defineUniforms");
}

export function createFragmentShader<const S extends UniformSchema>(
  callback: (context: FragmentContext<S>) => Expr<Vec4<F32>>,
  options: { readonly uniforms: UniformDefinition<S> },
): TypedCompiledFragmentArtifact<S>;
export function createFragmentShader(
  callback: (context: FragmentContext) => Expr<Vec4<F32>>,
): TypedCompiledFragmentArtifact<Record<never, never>>;
export function createFragmentShader(
  _callback: (context: FragmentContext) => Expr<Vec4<F32>>,
  _options?: { readonly uniforms: UniformDefinition<UniformSchema> },
): CompiledFragmentArtifact {
  return shaderSourceWasNotTransformed("createFragmentShader");
}

export function vec2(x: Expr<F32>, y: Expr<F32>): Expr<Vec2<F32>>;
export function vec2(value: Expr<F32>): Expr<Vec2<F32>>;
export function vec2(value: Expr<Vec2<F32>>): Expr<Vec2<F32>>;
export function vec2(..._arguments: readonly unknown[]): Expr<Vec2<F32>> {
  return shaderSourceWasNotTransformed("vec2");
}

export function vec3(x: Expr<F32>, y: Expr<F32>, z: Expr<F32>): Expr<Vec3<F32>>;
export function vec3(xy: Expr<Vec2<F32>>, z: Expr<F32>): Expr<Vec3<F32>>;
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
export function vec4(xyz: Expr<Vec3<F32>>, w: Expr<F32>): Expr<Vec4<F32>>;
export function vec4(value: Expr<F32>): Expr<Vec4<F32>>;
export function vec4(value: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
export function vec4(..._arguments: readonly unknown[]): Expr<Vec4<F32>> {
  return shaderSourceWasNotTransformed("vec4");
}

export function mat2(value: Expr<F32>): Expr<Mat2<F32>>;
export function mat2(
  c0: Expr<F32>,
  c1: Expr<F32>,
  c2: Expr<F32>,
  c3: Expr<F32>,
): Expr<Mat2<F32>>;
export function mat2(c0: Expr<Vec2<F32>>, c1: Expr<Vec2<F32>>): Expr<Mat2<F32>>;
export function mat2(value: Expr<Mat2<F32>>): Expr<Mat2<F32>>;
export function mat2(..._arguments: readonly unknown[]): Expr<Mat2<F32>> {
  return shaderSourceWasNotTransformed("mat2");
}

export function mat3(value: Expr<F32>): Expr<Mat3<F32>>;
export function mat3(
  c0: Expr<F32>,
  c1: Expr<F32>,
  c2: Expr<F32>,
  c3: Expr<F32>,
  c4: Expr<F32>,
  c5: Expr<F32>,
  c6: Expr<F32>,
  c7: Expr<F32>,
  c8: Expr<F32>,
): Expr<Mat3<F32>>;
export function mat3(
  c0: Expr<Vec3<F32>>,
  c1: Expr<Vec3<F32>>,
  c2: Expr<Vec3<F32>>,
): Expr<Mat3<F32>>;
export function mat3(value: Expr<Mat3<F32>>): Expr<Mat3<F32>>;
export function mat3(..._arguments: readonly unknown[]): Expr<Mat3<F32>> {
  return shaderSourceWasNotTransformed("mat3");
}

export function mat4(value: Expr<F32>): Expr<Mat4<F32>>;
export function mat4(
  c0: Expr<F32>,
  c1: Expr<F32>,
  c2: Expr<F32>,
  c3: Expr<F32>,
  c4: Expr<F32>,
  c5: Expr<F32>,
  c6: Expr<F32>,
  c7: Expr<F32>,
  c8: Expr<F32>,
  c9: Expr<F32>,
  c10: Expr<F32>,
  c11: Expr<F32>,
  c12: Expr<F32>,
  c13: Expr<F32>,
  c14: Expr<F32>,
  c15: Expr<F32>,
): Expr<Mat4<F32>>;
export function mat4(
  c0: Expr<Vec4<F32>>,
  c1: Expr<Vec4<F32>>,
  c2: Expr<Vec4<F32>>,
  c3: Expr<Vec4<F32>>,
): Expr<Mat4<F32>>;
export function mat4(value: Expr<Mat4<F32>>): Expr<Mat4<F32>>;
export function mat4(..._arguments: readonly unknown[]): Expr<Mat4<F32>> {
  return shaderSourceWasNotTransformed("mat4");
}
