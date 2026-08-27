declare const shaderType: unique symbol;
declare const expressionType: unique symbol;
declare const fragmentShaderSource: unique symbol;

export interface F32 {
  readonly [shaderType]: "f32";
}

export interface Vec2<T extends F32> {
  readonly [shaderType]: readonly ["vec2", T];
}

export interface Vec4<T extends F32> {
  readonly [shaderType]: readonly ["vec4", T];
}

export type ShaderType = F32 | Vec2<F32> | Vec4<F32>;

interface ExpressionBrand<T extends ShaderType> {
  readonly [expressionType]: T;
}

type Swizzles<T extends ShaderType> =
  T extends Vec2<infer Scalar extends F32>
    ? VectorSwizzles<Scalar>
    : T extends Vec4<infer Scalar extends F32>
      ? VectorSwizzles<Scalar>
      : object;

interface VectorSwizzles<T extends F32> {
  readonly x: Expr<T>;
  readonly y: Expr<T>;
  readonly xy: Expr<Vec2<T>>;
}

export type Expr<T extends ShaderType> = ExpressionBrand<T> & Swizzles<T>;

export interface DefaultUniforms {
  readonly resolution: Expr<Vec2<F32>>;
  readonly mouse: Expr<Vec2<F32>>;
  readonly time: Expr<F32>;
}

export interface FragmentContext {
  readonly coord: Expr<Vec4<F32>>;
  readonly uniforms: DefaultUniforms;
}

export type FragmentShaderSource = string & {
  readonly [fragmentShaderSource]: true;
};
