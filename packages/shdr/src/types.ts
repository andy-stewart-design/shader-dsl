declare const shaderType: unique symbol;
declare const expressionType: unique symbol;
declare const fragmentShaderSource: unique symbol;

export interface F32 {
  readonly [shaderType]: "f32";
}

export interface Vec2<T extends F32> {
  readonly [shaderType]: readonly ["vec2", T];
}

export interface Vec3<T extends F32> {
  readonly [shaderType]: readonly ["vec3", T];
}

export interface Vec4<T extends F32> {
  readonly [shaderType]: readonly ["vec4", T];
}

export type ShaderType = F32 | Vec2<F32> | Vec3<F32> | Vec4<F32>;

interface ExpressionBrand<T extends ShaderType> {
  readonly [expressionType]: T;
}

type SwizzleNames<Components extends string> =
  | Components
  | `${Components}${Components}`
  | `${Components}${Components}${Components}`
  | `${Components}${Components}${Components}${Components}`;

type SwizzleValue<
  Name extends string,
  Scalar extends F32,
  Components extends string,
> = Name extends Components
  ? Expr<Scalar>
  : Name extends `${Components}${Components}`
    ? Expr<Vec2<Scalar>>
    : Name extends `${Components}${Components}${Components}`
      ? Expr<Vec3<Scalar>>
      : Expr<Vec4<Scalar>>;

type VectorSwizzles<Scalar extends F32, Components extends string> = {
  readonly [Name in SwizzleNames<Components>]: SwizzleValue<
    Name,
    Scalar,
    Components
  >;
};

type Swizzles<T extends ShaderType> =
  T extends Vec2<infer Scalar extends F32>
    ? VectorSwizzles<Scalar, "x" | "y">
    : T extends Vec3<infer Scalar extends F32>
      ? VectorSwizzles<Scalar, "x" | "y" | "z">
      : T extends Vec4<infer Scalar extends F32>
        ? VectorSwizzles<Scalar, "x" | "y" | "z" | "w">
        : object;

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
