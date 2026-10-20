# `shdr` (workspace-only)

Source-language declarations, expression types and artifact types for the [restricted shader language](../../README.md#accepted-shader-language). These DSL functions are **not** runtime shader builders: use `@shdr/vite` for a static `.shdr.ts` import or opt in to `@shdr/core/browser` for edited source. Never import and execute an authored `.shdr.ts` file as ordinary JavaScript to read defaults.

```ts
// fragment.shdr.ts — concise form
import { defineUniforms, vec4 } from "shdr";
export default defineUniforms((u) => ({
  color: u.vec3(0.2, 0.4, 0.6),
  gain: u.f32(0.25),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color.x, uniforms.color.y, uniforms.gain, uniforms.color.z),
);
```

An equivalent named form declares `const uniforms = defineUniforms((u) => ({ ... }))` in the same file—or imports that named declaration from another `.shdr.ts` module—and links it with `createFragmentShader(({ uniforms }) => ..., { uniforms })`; see [the complete named fixture](../../apps/vite-basic/src/custom-demo-named.shdr.ts). Without custom inputs, `createFragmentShader(callback)` remains supported. Only static finite f32 numeric literals (including unary minus) may be used for defaults; for example `u.f32(window.devicePixelRatio)` is rejected at its original source range, not evaluated. Custom names cannot shadow the automatic `resolution`, `mouse` or `time` uniforms. The callback reads custom expressions alongside those three automatic expressions. In a named context, `$.u` and `$.uniforms` are the same uniform namespace; callback parameters may destructure `u`, `uniforms`, or both in any order alongside `coord`. A straight-line `const u = $.u` (including aliases of that alias) is compile-time only: the namespace cannot be used as a shader value or passed to helpers. Body destructuring such as `const { u } = $` remains unsupported. The `{ uniforms }` option still links a custom schema and preserves typed host updates.

A Vite-imported authored shader retains `TypedCompiledFragmentArtifact<S>` at the TypeScript boundary, with `S` inferred from its declarations; it is the same JSON artifact as `CompiledFragmentArtifact`, plus a **type-only** invariant schema identity. The browser compiler returns a schema-erased `DynamicCompiledFragmentArtifact` because arbitrary source can change at runtime. No type brands or authored JavaScript are serialized into the artifact. See the [runtime host API](../runtime/README.md) for creation overrides, `setUniforms`, resets, replacement and WebGL/WebGPU layout. Ordinary standalone `tsc` does not understand shader operators inside authored callbacks; use `shdr check` for shader semantics and the TypeScript 7 editor adapter for mapped hovers/diagnostics.

## Textures and sampling

Declare still-image textures with `u.texture2D("...")` and sample them with `sample(texture, uv)`. The URL is a literal artifact resource: root-absolute URLs are intended for Vite public assets, while external HTTPS URLs are available to hosts such as the REPL. The core artifact records URL metadata and target-specific texture/sampler bindings; it does not fetch images or impose the REPL's HTTPS-only policy.

```ts
import { defineUniforms, sample, vec2 } from "shdr";

export default defineUniforms((u) => ({
  photo: u.texture2D("/photo.png"),
})).createFragmentShader(({ uniforms }) => sample(uniforms.photo, vec2(0, 0)));
```

Sampling is normalized and top-left-origin. Runtime hosts use fixed linear filtering, clamp-to-edge addressing, no mipmaps, and preserve the previous installed shader when a replacement image cannot be fetched or decoded. Texture resources are still images; video, picker uploads and custom samplers are outside this contract.

## Reusable helpers and schemas

Use a top-level `const` initialized with `defineShaderFunction` for a compile-only helper. Parameters must be explicit `Expr<F32>` or `Expr<Vec2/3/4<F32>>` types; returns may be inferred or annotated. Helpers cannot capture uniforms, `coord`, module values or host JavaScript. Exported helpers and `defineUniforms` declarations may live in helper-only `.shdr.ts` files or beside a default fragment. Import them directly by name from relative paths or configured TypeScript `paths` aliases, and explicitly link an imported schema with `{ uniforms }`.

Neither the compiler nor Vite executes authored modules or callbacks. Named exports are compile-time graph inputs; a Vite module's runtime value is its default compiled artifact. The browser REPL accepts local helpers in its one textarea, but has no file map or fetch path: an external `.shdr.ts` import reports `SHDR1300` and leaves the last successful render installed.

## Static module constants

A same-file top-level `const` can be referenced from shader regions when it is initialized by a finite numeric literal (including unary minus), an earlier eligible alias, or a direct `vec2`/`vec3`/`vec4` constructor using those values. This is source-only lowering: ordinary TypeScript sees a `number`, while shader references see `Expr<F32>` or the matching `Expr<VecN<F32>>`. A helper resolves constants in its defining file; constants are not an importable shader dependency.

Initializer arithmetic, swizzles, builtins, arbitrary calls, imports, mutable values, authored execution, and constant-derived uniform defaults are rejected. Constants add no artifact fields, bindings, runtime values, or host update path. They use the existing finite-f32 rounding/precision boundary. See the [full module-constants specification](../../plans/module-contstants/spec.md).

## Square matrices

The public authoring API exposes compile-only `Mat2<F32>`, `Mat3<F32>`, and `Mat4<F32>` types with direct `mat2`, `mat3`, and `mat4` constructors. Each size accepts a diagonal scalar, exactly `N*N` scalar coefficients, exactly `N` complete `vecN` columns, or a same-size matrix copy. Coefficients and columns are column-major: `mat2(1, 2, 3, 4)` represents rows `(1, 3)` and `(2, 4)`, while `mat2(1)` is identity rather than a scalar splat.

For a fixed size, the supported binary families are matrix addition, matrix subtraction, matrix-times-scalar, scalar-times-matrix, matrix-times-column-vector, row-vector-times-matrix, and matrix-times-matrix. These provide 21 concrete signatures across Mat2/3/4 and preserve native multiplication direction and grouping. `M * -1` is valid. Matrix division, unary matrix negation, matrix indexing/properties, size conversion, matrix uniforms, matrix builtins, mismatched dimensions, and arbitrary constructor packing are outside the API. Helpers may take `Expr<MatN<F32>>` parameters and infer or annotate matrix returns; fragment entries still return `Expr<Vec4<F32>>`.

Matrix expressions remain target-neutral and do not add artifact fields, runtime uploads, or host matrix values. Ordinary finite f32 inputs are the portable boundary; products are not reduced component-wise by constant analysis, and extreme overflow/precision behavior is not promised. See the [full accepted-language matrix section](../../README.md#square-matrices) and the [source fixture](../../apps/vite-basic/src/square-matrices.shdr.ts).

## Orbit/trigonometry builtins

The public package exposes exactly 31 orbit/trigonometry signatures across six direct imports:

| Builtin                              | Accepted operands → result                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `asin`, `acos`, `radians`, `degrees` | `(Expr<F32>) → Expr<F32>`, `(Expr<VecN<F32>>) → Expr<VecN<F32>>`                                      |
| `atan`                               | The same unary forms plus `(S, S) → S` and `(VecN<F32>, VecN<F32>) → VecN<F32>`; the pair is `(y, x)` |
| `mod`                                | `(S, S) → S`, `(VecN<F32>, VecN<F32>) → VecN<F32>`, and `(VecN<F32>, S) → VecN<F32>`                  |

Here `N` is 2, 3, or 4 and `S` is `Expr<F32>`. There is no scalar-first vector broadcasting, mixed vector dimension support, or public `atan2` alias. `asin`/`acos` require inputs in `[-1, 1]`; binary `atan` uses native GLSL `atan(y, x)` and WGSL `atan2(y, x)`; and `mod` uses `x - y * floor(x / y)` with nonzero divisors. Known violations produce source-located `SHDR1209`; dynamic values remain caller preconditions. Exact origin, signed-zero-sensitive binary-`atan` axes, and very small inputs have no portable value guarantee.

## Mixed-shape `clamp` and `pow`

For one fixed vector shape `V` (`Vec2`, `Vec3`, or `Vec4`), `clamp(V, S | V, S | V)` and `pow(V, S)` are supported in addition to the same-shape scalar/vector forms. Each scalar bound or exponent broadcasts only at that call boundary; use explicit `vecN(...)` when a scalar base must become a vector. Scalar-first `clamp`, vector exponents with a scalar base, mixed vector dimensions, and general implicit broadcasting remain unsupported. Both GLSL ES and WGSL artifacts receive explicit target-native vector splats, while the serialized target-neutral expression keeps the authored scalar arguments.
