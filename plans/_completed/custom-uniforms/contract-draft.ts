// Gate 0 only: proposed signatures over the real workspace's base types.
// These declarations emit no JavaScript and are NOT public package exports.
import type {
  CompiledFragmentArtifact,
  DefaultUniforms,
  Expr,
  F32,
  FragmentContext,
  Vec2,
  Vec3,
  Vec4,
} from "../../packages/shdr/src/index.js";
import type {
  Renderer,
  RendererOptions,
  ShaderInstallOptions,
  ShaderInstallResult,
} from "../../packages/runtime/src/types.js";
import type { RuntimeErrorKind } from "../../packages/runtime/src/errors.js";

// Proposed addition: malformed host values are not malformed artifacts.
export type CustomUniformErrorKind = RuntimeErrorKind | "uniform";

export type UniformKind = "f32" | "vec2" | "vec3" | "vec4";
export type UniformValue<K extends UniformKind> = K extends "f32"
  ? number
  : K extends "vec2"
    ? readonly [number, number]
    : K extends "vec3"
      ? readonly [number, number, number]
      : readonly [number, number, number, number];
export interface UniformDeclaration<K extends UniformKind> {
  readonly kind: K;
  readonly defaultValue: UniformValue<K>;
}
export interface UniformBuilder {
  f32(value: number): UniformDeclaration<"f32">;
  vec2(x: number, y: number): UniformDeclaration<"vec2">;
  vec3(x: number, y: number, z: number): UniformDeclaration<"vec3">;
  vec4(x: number, y: number, z: number, w: number): UniformDeclaration<"vec4">;
}
export type UniformSchema = Readonly<
  Record<string, UniformDeclaration<UniformKind>>
>;
type KindOf<T> = T extends UniformDeclaration<infer K> ? K : never;
type ShaderValue<K extends UniformKind> = K extends "f32"
  ? F32
  : K extends "vec2"
    ? Vec2<F32>
    : K extends "vec3"
      ? Vec3<F32>
      : Vec4<F32>;
type ShaderUniforms<S extends UniformSchema> = {
  readonly [K in keyof S]: Expr<ShaderValue<KindOf<S[K]>>>;
};
export type HostUniforms<S extends UniformSchema> = {
  readonly [K in keyof S]: UniformValue<KindOf<S[K]>>;
};
export type UniformContext<S extends UniformSchema> = Omit<
  FragmentContext,
  "uniforms"
> & { readonly uniforms: DefaultUniforms & ShaderUniforms<S> };

// Type-only, invariant schema identity. No symbol appears in the JSON artifact.
declare const staticSchema: unique symbol;
declare const dynamicSchema: unique symbol;
export type StaticArtifact<S extends UniformSchema> =
  CompiledFragmentArtifact & {
    readonly [staticSchema]: (schema: S) => S;
  };
export type DynamicArtifact = CompiledFragmentArtifact & {
  readonly [dynamicSchema]: true;
};
export interface UniformDefinition<S extends UniformSchema> {
  readonly schema: S;
  createFragmentShader(
    callback: (context: UniformContext<S>) => Expr<Vec4<F32>>,
  ): StaticArtifact<S>;
}
export declare function defineUniforms<const S extends UniformSchema>(
  callback: (u: UniformBuilder) => S,
): UniformDefinition<S>;
export declare function createFragmentShader<const S extends UniformSchema>(
  callback: (context: UniformContext<S>) => Expr<Vec4<F32>>,
  options: { readonly uniforms: UniformDefinition<S> },
): StaticArtifact<S>;
export declare function createFragmentShader(
  callback: (context: FragmentContext) => Expr<Vec4<F32>>,
): StaticArtifact<{}>;

export interface UniformMethods<S extends UniformSchema> {
  setUniforms<const V extends Partial<HostUniforms<S>>>(
    values: V & Record<Exclude<keyof V, keyof S>, never>,
  ): void;
  resetUniforms(...names: readonly (keyof S & string)[]): void;
}
export interface StaticRenderer<S extends UniformSchema>
  extends
    UniformMethods<S>,
    Pick<
      Renderer,
      "cancelPendingShader" | "setPointerNormalized" | "draw" | "dispose"
    > {
  setShader(
    artifact: StaticArtifact<S>,
    options?: ShaderInstallOptions,
  ): Promise<ShaderInstallResult>;
}
export type DynamicUniformValue = UniformValue<UniformKind>;
export interface DynamicRenderer extends Pick<
  Renderer,
  "cancelPendingShader" | "setPointerNormalized" | "draw" | "dispose"
> {
  setShader(
    artifact: CompiledFragmentArtifact,
    options?: ShaderInstallOptions,
  ): Promise<ShaderInstallResult>;
  setUniforms(values: Readonly<Record<string, DynamicUniformValue>>): void;
  resetUniforms(...names: readonly string[]): void;
}
export declare function createWebGlRenderer<
  const S extends UniformSchema,
  const V extends Partial<HostUniforms<S>> = Partial<HostUniforms<S>>,
>(
  canvas: HTMLCanvasElement,
  artifact: StaticArtifact<S>,
  options?: RendererOptions & {
    readonly uniforms?: V & Record<Exclude<keyof V, keyof S>, never>;
  },
): Promise<StaticRenderer<S>>;
export declare function createWebGlRenderer(
  canvas: HTMLCanvasElement,
  artifact: DynamicArtifact,
  options?: RendererOptions & {
    readonly uniforms?: Readonly<Record<string, DynamicUniformValue>>;
  },
): Promise<DynamicRenderer>;
// Legacy schema-erased values remain usable without introducing an unsafe
// overload through which a mistyped static creation override could fall.
export declare function createWebGlRenderer(
  canvas: HTMLCanvasElement,
  artifact: CompiledFragmentArtifact,
  options?: RendererOptions & { readonly uniforms?: never },
): Promise<DynamicRenderer>;
export declare function createWebGpuRenderer<
  const S extends UniformSchema,
  const V extends Partial<HostUniforms<S>> = Partial<HostUniforms<S>>,
>(
  canvas: HTMLCanvasElement,
  artifact: StaticArtifact<S>,
  options?: RendererOptions & {
    readonly uniforms?: V & Record<Exclude<keyof V, keyof S>, never>;
  },
): Promise<StaticRenderer<S>>;
export declare function createWebGpuRenderer(
  canvas: HTMLCanvasElement,
  artifact: DynamicArtifact,
  options?: RendererOptions & {
    readonly uniforms?: Readonly<Record<string, DynamicUniformValue>>;
  },
): Promise<DynamicRenderer>;
export declare function createWebGpuRenderer(
  canvas: HTMLCanvasElement,
  artifact: CompiledFragmentArtifact,
  options?: RendererOptions & { readonly uniforms?: never },
): Promise<DynamicRenderer>;

// The future @shdr/core/browser success artifact is dynamic/schema-erased.
export declare function compileEditedSource(
  source: string,
):
  | { readonly ok: true; readonly artifact: DynamicArtifact }
  | { readonly ok: false; readonly diagnostics: readonly unknown[] };
