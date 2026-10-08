import { shaderSourceWasNotTransformed } from "./runtime-error.js";
import type {
  Expr,
  F32,
  FragmentContext,
  CompiledFragmentArtifact,
  Vec2,
  Vec3,
  Vec4,
  UniformBuilder,
  UniformDefinition,
  UniformSchema,
  TypedCompiledFragmentArtifact,
  ShaderFunction,
  ShaderType,
} from "./types.js";

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
