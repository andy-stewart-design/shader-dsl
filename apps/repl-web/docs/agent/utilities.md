# REPL utilities and constructors

The REPL imports the expression constructors and helper entry points from `shdr`. Every shader argument is an expression; numeric literals in authored shader source are accepted as `f32` expressions. The exact public declarations below are generated from `packages/shdr/src/dsl.ts` and `packages/shdr/src/types.ts`.

## Exact public signatures

<!-- BEGIN GENERATED UTILITY SIGNATURES -->

> **Generated from the public shdr source signatures; do not edit this block.**

### DSL entry points

```ts
export function sample(
  _texture: Texture2D,
  _uv: Expr<Vec2<F32>>,
): Expr<Vec4<F32>>;

export function defineShaderFunction<
  Args extends readonly Expr<ShaderType>[],
  Result extends Expr<ShaderType>,
>(_callback: (...args: Args) => Result): ShaderFunction<Args, Result>;

export function defineUniforms<const S extends UniformSchema>(
  _callback: (u: UniformBuilder) => S,
): UniformDefinition<S>;

export function createFragmentShader<const S extends UniformSchema>(
  callback: (context: FragmentContext<S>) => Expr<Vec4<F32>>,
  options: {
    readonly uniforms: UniformDefinition<S>;
  },
): TypedCompiledFragmentArtifact<S>;

export function createFragmentShader(
  callback: (context: FragmentContext) => Expr<Vec4<F32>>,
): TypedCompiledFragmentArtifact<Record<never, never>>;

export function vec2(x: Expr<F32>, y: Expr<F32>): Expr<Vec2<F32>>;

export function vec2(value: Expr<F32>): Expr<Vec2<F32>>;

export function vec2(value: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function vec3(x: Expr<F32>, y: Expr<F32>, z: Expr<F32>): Expr<Vec3<F32>>;

export function vec3(xy: Expr<Vec2<F32>>, z: Expr<F32>): Expr<Vec3<F32>>;

export function vec3(value: Expr<F32>): Expr<Vec3<F32>>;

export function vec3(value: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

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

export function mat2(value: Expr<F32>): Expr<Mat2<F32>>;

export function mat2(
  c0: Expr<F32>,
  c1: Expr<F32>,
  c2: Expr<F32>,
  c3: Expr<F32>,
): Expr<Mat2<F32>>;

export function mat2(c0: Expr<Vec2<F32>>, c1: Expr<Vec2<F32>>): Expr<Mat2<F32>>;

export function mat2(value: Expr<Mat2<F32>>): Expr<Mat2<F32>>;

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

```

### UniformBuilder methods

```ts
  f32(value: number): UniformDeclaration<"f32">;
  vec2(x: number, y: number): UniformDeclaration<"vec2">;
  vec3(x: number, y: number, z: number): UniformDeclaration<"vec3">;
  vec4(x: number, y: number, z: number, w: number): UniformDeclaration<"vec4">;
  texture2D<const U extends string>(
    url: U & (string extends U ? never : unknown),
  ): TextureUniformDeclaration & {
    readonly url: U;
  };
```
<!-- END GENERATED UTILITY SIGNATURES -->

The generated block is the source-of-truth reference for constructors, helper creation, uniform schemas, the fragment entry point, and `UniformBuilder`. Matrix constructor components are column-major. Constructors and helpers are source markers and are not ordinary JavaScript values at runtime.

## Helpers and sampling

`defineShaderFunction` creates a compile-time helper. In REPL Utils, annotate callback parameters with explicit `Expr<...>` types and return an expression. Helpers may call directly declared helpers when the call is expressed in shader source; an implicit value such as `coord` or `u` must be passed as an explicit expression argument. Do not capture editor state or host values.

```ts example=paired
// Utils
const ring = defineShaderFunction((p: Expr<Vec2<F32>>): Expr<F32> => {
  return length(p) - 0.25;
});

// Main
const uv = coord.xy / u.resolution;
const centered = uv * 2 - 1;
const glow = clamp(1 - abs(ring(centered)), 0, 1);
return vec4(glow, glow * 0.4, 0.1, 1);
```

`sample` accepts a declared `Texture2D` and a `Vec2` expression. The REPL Uniforms pane has no texture declaration or texture resource setup, so there is no runnable texture example here; do not invent one. `defineUniforms` and `UniformBuilder` belong to the full-file API boundary, while the REPL creates its supported float and color declarations through the Uniforms pane.

`createFragmentShader` is generated around Main and must not be pasted into either editor. The full-file `defineUniforms(...).createFragmentShader(...)` form is likewise not an editor declaration; these signatures are documented to make the generated boundary precise.
