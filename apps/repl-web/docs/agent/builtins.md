# REPL math builtins

The REPL imports the compiler builtins named by `SHADER_BUILTINS` from `@shdr/core`. Every argument is an expression. The exact overload declarations below are generated from `packages/shdr/src/math.ts`; the compiler's shape rules come from the same canonical builtin inventory.

## Exact signatures

<!-- BEGIN GENERATED BUILTIN SIGNATURES -->

> **Generated from the public shdr source signatures; do not edit this block.**

```ts
export function sin(x: Expr<F32>): Expr<F32>;

export function sin(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function sin(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function sin(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function cos(x: Expr<F32>): Expr<F32>;

export function cos(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function cos(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function cos(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function dFdx(x: Expr<F32>): Expr<F32>;

export function dFdx(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function dFdx(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function dFdx(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function dFdy(x: Expr<F32>): Expr<F32>;

export function dFdy(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function dFdy(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function dFdy(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function fwidth(x: Expr<F32>): Expr<F32>;

export function fwidth(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function fwidth(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function fwidth(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function asin(x: Expr<F32>): Expr<F32>;

export function asin(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function asin(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function asin(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function acos(x: Expr<F32>): Expr<F32>;

export function acos(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function acos(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function acos(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function atan(x: Expr<F32>): Expr<F32>;

export function atan(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function atan(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function atan(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function atan(y: Expr<F32>, x: Expr<F32>): Expr<F32>;

export function atan(y: Expr<Vec2<F32>>, x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function atan(y: Expr<Vec3<F32>>, x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function atan(y: Expr<Vec4<F32>>, x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function radians(x: Expr<F32>): Expr<F32>;

export function radians(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function radians(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function radians(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function degrees(x: Expr<F32>): Expr<F32>;

export function degrees(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function degrees(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function degrees(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function ceil(x: Expr<F32>): Expr<F32>;

export function ceil(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function ceil(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function ceil(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function sqrt(x: Expr<F32>): Expr<F32>;

export function sqrt(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function sqrt(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function sqrt(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function exp(x: Expr<F32>): Expr<F32>;

export function exp(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function exp(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function exp(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function tanh(x: Expr<F32>): Expr<F32>;

export function tanh(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function tanh(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function tanh(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function clamp(x: Expr<F32>, low: Expr<F32>, high: Expr<F32>): Expr<F32>;

export function clamp(
  x: Expr<Vec2<F32>>,
  low: Expr<Vec2<F32>>,
  high: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;

export function clamp(
  x: Expr<Vec2<F32>>,
  low: Expr<F32>,
  high: Expr<F32>,
): Expr<Vec2<F32>>;

export function clamp(
  x: Expr<Vec2<F32>>,
  low: Expr<F32>,
  high: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;

export function clamp(
  x: Expr<Vec2<F32>>,
  low: Expr<Vec2<F32>>,
  high: Expr<F32>,
): Expr<Vec2<F32>>;

export function clamp(
  x: Expr<Vec3<F32>>,
  low: Expr<Vec3<F32>>,
  high: Expr<Vec3<F32>>,
): Expr<Vec3<F32>>;

export function clamp(
  x: Expr<Vec3<F32>>,
  low: Expr<F32>,
  high: Expr<F32>,
): Expr<Vec3<F32>>;

export function clamp(
  x: Expr<Vec3<F32>>,
  low: Expr<F32>,
  high: Expr<Vec3<F32>>,
): Expr<Vec3<F32>>;

export function clamp(
  x: Expr<Vec3<F32>>,
  low: Expr<Vec3<F32>>,
  high: Expr<F32>,
): Expr<Vec3<F32>>;

export function clamp(
  x: Expr<Vec4<F32>>,
  low: Expr<Vec4<F32>>,
  high: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;

export function clamp(
  x: Expr<Vec4<F32>>,
  low: Expr<F32>,
  high: Expr<F32>,
): Expr<Vec4<F32>>;

export function clamp(
  x: Expr<Vec4<F32>>,
  low: Expr<F32>,
  high: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;

export function clamp(
  x: Expr<Vec4<F32>>,
  low: Expr<Vec4<F32>>,
  high: Expr<F32>,
): Expr<Vec4<F32>>;

export function pow(base: Expr<F32>, exponent: Expr<F32>): Expr<F32>;

export function pow(
  base: Expr<Vec2<F32>>,
  exponent: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;

export function pow(
  base: Expr<Vec2<F32>>,
  exponent: Expr<F32>,
): Expr<Vec2<F32>>;

export function pow(
  base: Expr<Vec3<F32>>,
  exponent: Expr<Vec3<F32>>,
): Expr<Vec3<F32>>;

export function pow(
  base: Expr<Vec3<F32>>,
  exponent: Expr<F32>,
): Expr<Vec3<F32>>;

export function pow(
  base: Expr<Vec4<F32>>,
  exponent: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;

export function pow(
  base: Expr<Vec4<F32>>,
  exponent: Expr<F32>,
): Expr<Vec4<F32>>;

export function mod(x: Expr<F32>, y: Expr<F32>): Expr<F32>;

export function mod(x: Expr<Vec2<F32>>, y: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function mod(x: Expr<Vec2<F32>>, y: Expr<F32>): Expr<Vec2<F32>>;

export function mod(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function mod(x: Expr<Vec3<F32>>, y: Expr<F32>): Expr<Vec3<F32>>;

export function mod(x: Expr<Vec4<F32>>, y: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function mod(x: Expr<Vec4<F32>>, y: Expr<F32>): Expr<Vec4<F32>>;

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

export function abs(x: Expr<F32>): Expr<F32>;

export function abs(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function abs(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function abs(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function floor(x: Expr<F32>): Expr<F32>;

export function floor(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function floor(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function floor(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function fract(x: Expr<F32>): Expr<F32>;

export function fract(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function fract(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function fract(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function min(x: Expr<F32>, y: Expr<F32>): Expr<F32>;

export function min(x: Expr<Vec2<F32>>, y: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function min(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function min(x: Expr<Vec4<F32>>, y: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function max(x: Expr<F32>, y: Expr<F32>): Expr<F32>;

export function max(x: Expr<Vec2<F32>>, y: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function max(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function max(x: Expr<Vec4<F32>>, y: Expr<Vec4<F32>>): Expr<Vec4<F32>>;

export function dot(x: Expr<Vec2<F32>>, y: Expr<Vec2<F32>>): Expr<F32>;

export function dot(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<F32>;

export function dot(x: Expr<Vec4<F32>>, y: Expr<Vec4<F32>>): Expr<F32>;

export function distance(x: Expr<F32>, y: Expr<F32>): Expr<F32>;

export function distance(x: Expr<Vec2<F32>>, y: Expr<Vec2<F32>>): Expr<F32>;

export function distance(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<F32>;

export function distance(x: Expr<Vec4<F32>>, y: Expr<Vec4<F32>>): Expr<F32>;

export function cross(x: Expr<Vec3<F32>>, y: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function length(x: Expr<F32>): Expr<F32>;

export function length(x: Expr<Vec2<F32>>): Expr<F32>;

export function length(x: Expr<Vec3<F32>>): Expr<F32>;

export function length(x: Expr<Vec4<F32>>): Expr<F32>;

export function normalize(x: Expr<Vec2<F32>>): Expr<Vec2<F32>>;

export function normalize(x: Expr<Vec3<F32>>): Expr<Vec3<F32>>;

export function normalize(x: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
```
<!-- END GENERATED BUILTIN SIGNATURES -->

The signatures are intentionally explicit: scalar and vector overloads are not interchangeable, and builtins do not accept matrices. Numeric literals in shader source are valid `f32` expressions even though the public declarations use `Expr<F32>`.

## Common patterns

Unary builtins preserve a scalar or vector shape. This example is a complete Main body; `uv` is declared here so it can be pasted into the Main editor:

```ts example=main
const uv = coord.xy / u.resolution;
const bands = sin(uv.x * 20);
const color = vec3(abs(sin(u.time)), fract(uv.x), 0.2);
return vec4(color * bands, 1);
```

Binary builtins either require matching shapes or use one of the explicitly declared scalar/vector combinations:

```ts example=main
const uv = coord.xy / u.resolution;
const stripes = step(0.5, fract(uv.x * 8));
const pulse = pow(max(sin(u.time), 0), 2);
return vec4(stripes, pulse, mod(uv.y, 0.25), 1);
```

Ternary builtins preserve the shape of their value/result argument. `clamp` permits scalar bounds for vector values, while `smoothstep` requires all three arguments to have the same shape:

```ts example=main
const uv = coord.xy / u.resolution;
const t = smoothstep(0.2, 0.8, uv.x);
const color = mix(vec3(0.05, 0.1, 0.3), vec3(0.9, 0.4, 0.1), t);
return vec4(color, 1);
```

`dot`, `distance`, and `length` reduce to a scalar. `cross` and `normalize` operate on vectors; `cross` is only a `Vec3` operation. Matrices are constructed and multiplied separately from these builtins:

```ts example=main
const uv = (coord.xy / u.resolution) * 2 - 1;
const identity = mat2(1);
const transformed = identity * uv;
return vec4(transformed, 0, 1);
```

`atan` has both one-argument and same-shape two-argument forms. Derivatives (`dFdx`, `dFdy`, and `fwidth`) follow target shader derivative behavior. These names are source markers, not general JavaScript math functions outside compiled shader source.
