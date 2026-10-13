declare const shaderType: unique symbol;
declare const expressionType: unique symbol;

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
    ? VectorSwizzles<Scalar, "x" | "y"> & VectorSwizzles<Scalar, "r" | "g">
    : T extends Vec3<infer Scalar extends F32>
      ? VectorSwizzles<Scalar, "x" | "y" | "z"> &
          VectorSwizzles<Scalar, "r" | "g" | "b">
      : T extends Vec4<infer Scalar extends F32>
        ? VectorSwizzles<Scalar, "x" | "y" | "z" | "w"> &
            VectorSwizzles<Scalar, "r" | "g" | "b" | "a">
        : object;

export type Expr<T extends ShaderType> = ExpressionBrand<T> & Swizzles<T>;

declare const shaderFunctionBrand: unique symbol;
/** Source-only callable marker; authored callbacks are never evaluated. */
export type ShaderFunction<
  Args extends readonly Expr<ShaderType>[],
  Result extends Expr<ShaderType>,
> = ((...args: Args) => Result) & {
  readonly [shaderFunctionBrand]: true;
};

export interface DefaultUniforms {
  readonly resolution: Expr<Vec2<F32>>;
  readonly mouse: Expr<Vec2<F32>>;
  readonly time: Expr<F32>;
}

export type ShaderCustomUniformType = "f32" | "vec2" | "vec3" | "vec4";
export interface Texture2D {
  readonly [shaderType]: "texture2D";
}
export interface TextureUniformDeclaration {
  readonly type: "texture2D";
  readonly url: string;
}
export type UniformValue<T extends ShaderCustomUniformType> = T extends "f32"
  ? number
  : T extends "vec2"
    ? readonly [number, number]
    : T extends "vec3"
      ? readonly [number, number, number]
      : readonly [number, number, number, number];
export type UniformDeclaration<
  T extends ShaderCustomUniformType = ShaderCustomUniformType,
> = {
  [K in T]: { readonly type: K; readonly default: UniformValue<K> };
}[T];
export type UniformSchema = Readonly<
  Record<string, UniformDeclaration | TextureUniformDeclaration>
>;
type UniformTypeOf<D extends UniformDeclaration> = D["type"];
type ShaderValue<T extends ShaderCustomUniformType> = T extends "f32"
  ? F32
  : T extends "vec2"
    ? Vec2<F32>
    : T extends "vec3"
      ? Vec3<F32>
      : Vec4<F32>;
type UniformExpressionOf<D> = D extends TextureUniformDeclaration
  ? Texture2D
  : D extends UniformDeclaration
    ? Expr<ShaderValue<UniformTypeOf<D>>>
    : never;
type NumericUniformKeys<S extends UniformSchema> = keyof {
  [K in keyof S as S[K] extends UniformDeclaration ? K : never]: S[K];
};
export type UniformExpressions<S extends UniformSchema> = {
  readonly [K in keyof S]: UniformExpressionOf<S[K]>;
};
export type HostUniforms<S extends UniformSchema> = {
  readonly [K in NumericUniformKeys<S>]: S[K] extends UniformDeclaration
    ? UniformValue<UniformTypeOf<S[K]>>
    : never;
};
export interface UniformBuilder {
  f32(value: number): UniformDeclaration<"f32">;
  vec2(x: number, y: number): UniformDeclaration<"vec2">;
  vec3(x: number, y: number, z: number): UniformDeclaration<"vec3">;
  vec4(x: number, y: number, z: number, w: number): UniformDeclaration<"vec4">;
  texture2D<const U extends string>(
    url: U & (string extends U ? never : unknown),
  ): TextureUniformDeclaration & { readonly url: U };
}
export interface FragmentContext<
  S extends UniformSchema = Record<never, never>,
> {
  readonly coord: Expr<Vec4<F32>>;
  readonly uniforms: DefaultUniforms & UniformExpressions<S>;
}

export type ShaderDefaultUniform = "resolution" | "mouse" | "time";

// Type-only invariant schema marker; compiled artifacts remain JSON data.
declare const uniformSchemaBrand: unique symbol;
export type TypedCompiledFragmentArtifact<S extends UniformSchema> =
  CompiledFragmentArtifact & {
    readonly [uniformSchemaBrand]: (schema: S) => S;
  };
declare const dynamicArtifactBrand: unique symbol;
export type DynamicCompiledFragmentArtifact = CompiledFragmentArtifact & {
  readonly [dynamicArtifactBrand]: true;
};
export interface UniformDefinition<S extends UniformSchema> {
  readonly schema: S;
  createFragmentShader(
    callback: (context: FragmentContext<S>) => Expr<Vec4<F32>>,
  ): TypedCompiledFragmentArtifact<S>;
}
export type ShaderCustomUniformDeclaration = UniformDeclaration & {
  readonly name: string;
};
export type ShaderTextureUrlKind = "root-absolute" | "https";
export interface ShaderTextureDeclaration {
  readonly name: string;
  readonly type: "texture2D";
  readonly url: string;
  readonly urlKind: ShaderTextureUrlKind;
}
export interface ShaderTextureBinding {
  readonly name: string;
  readonly binding: number;
}

/** JSON-serializable, immutable-by-contract output of one Shdr compilation. */
export interface CompiledFragmentArtifact {
  readonly glsl: string;
  readonly wgsl: string;
  readonly defaults: {
    readonly glsl: readonly ShaderDefaultUniform[];
    readonly wgsl: readonly ShaderDefaultUniform[];
  };
  readonly custom?: {
    readonly declarations: readonly ShaderCustomUniformDeclaration[];
    readonly referenced: {
      readonly glsl: readonly string[];
      readonly wgsl: readonly string[];
    };
  };
  readonly resources?: {
    readonly textures: readonly ShaderTextureDeclaration[];
    readonly referenced?: {
      readonly glsl: readonly string[];
      readonly wgsl: readonly string[];
    };
    readonly bindings?: {
      readonly glsl: readonly ShaderTextureBinding[];
      readonly wgsl: readonly ShaderTextureBinding[];
    };
  };
}
