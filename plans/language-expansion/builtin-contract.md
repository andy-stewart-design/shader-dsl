# Phase 1 contract — finite math builtin set

Status: **Phase 1 contract reviewed; Phase 2 implemented, pending Gate 2 review**. This freezes the proposed PR boundary and signatures at the Phase 1 gate; change a signature or diagnostic only with an explicit review and parity-test update. The [implementation plan](./plan.md) requires all eleven names in one PR. [Raw target feasibility](../../packages/core/test/math-builtin-target-feasibility.test.ts) tests target languages, **not** Shdr checking, generated shaders or real-editor support.

## Types and accepted calls

`S` means `Expr<F32>`; `V2`, `V3`, `V4` mean `Expr<Vec2<F32>>`, `Expr<Vec3<F32>>`, `Expr<Vec4<F32>>`. Each `Vn` in a row must have the **same** dimension; `n ∈ {2, 3, 4}`. Numeric literals inside the callback have type `S`. Names below denote direct, unaliased named imports from exactly `"shdr"`, called directly inside the fragment callback. No globals, `Math.*`, arbitrary target builtins or runtime JS evaluation.

| Name                    | Accepted arguments → result                        | Accepted shapes                                                   |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `sin`, `cos`            | `(S) → S`, `(Vn) → Vn`                             | 4 per name; vector calls act component-wise                       |
| `smoothstep`            | `(T edge0, T edge1, T x) → T`, `T = S` or one `Vn` | 4; same shape for all three arguments, component-wise for vectors |
| `abs`, `floor`, `fract` | `(S) → S`, `(Vn) → Vn`                             | 4 per name; vector calls act component-wise                       |
| `min`, `max`            | `(S, S) → S`, `(Vn, Vn) → Vn`                      | 4 per name; same-sized vector operands                            |
| `dot`                   | `(Vn, Vn) → S`                                     | 3                                                                 |
| `length`                | `(S) → S`, `(Vn) → S`                              | 4; scalar length resembles `abs` for finite inputs                |
| `normalize`             | `(Vn) → Vn`                                        | 3                                                                 |

That is **42 target-tested signature shapes** across eleven names. Unary calls preserve scalar/vector type except `length`, which returns `S` for both scalar and vector input; `dot` reduces two vectors to `S`. There is no scalar `normalize`/`dot`, mixed-shape `smoothstep`, vector/scalar `min`/`max`, mixed vector dimensions, implicit broadcasting, integer or boolean variant in this PR. Those forms are **DSL errors even if a backend happens to compile them**. The WGSL generic parameterization is mirrored only for Shdr's `f32` and `vecN<f32>` values, not for `f16`, abstract numerics or integer variants.

A positive source example (accepted by the Phase 2 compiler/checker path; integrated runtime verification is Phase 3):

```ts
import {
  abs,
  cos,
  createFragmentShader,
  dot,
  floor,
  fract,
  length,
  max,
  min,
  normalize,
  sin,
  smoothstep,
  vec2,
  vec4,
} from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const direction = normalize(coord.xyz);
  const cells = floor(uv);
  const oscillation = cos(uv);
  const softCells = smoothstep(vec2(0), vec2(1), oscillation);
  const pulse = sin(uniforms.time) + softCells.x;
  const band = smoothstep(0.2, 0.8, fract(length(uv) + pulse));
  const brightness = min(max(abs(dot(direction, coord.xyz)), length(-1)), 1);
  return vec4(band, brightness, brightness, 1);
});
```

Successful call expressions and local references hover as `Expr<F32>` or `Expr<VecN<F32>>` according to this table. Ordinary `.ts` files and code outside the callback retain ordinary TypeScript ownership; the standalone `shdr check` CLI still does not type-check ordinary TypeScript.

## Diagnostics and source ownership

- Add **`SHDR1208` (`InvalidBuiltin`)** for a correctly imported builtin with unsupported arity or argument types. Message shape: `No matching "dot" builtin for argument types (Expr<Vec2<F32>>, Expr<Vec3<F32>>).` Empty arguments display `()`. The range is the **entire original call**, from the callee through the closing parenthesis. Hover must not present an accepted shader type for an invalid call. Virtual TypeScript and core must agree on the failure; do not leak helper names, generated ranges, or a secondary native TypeScript overload cascade.
- Add **`SHDR1209` (`InvalidBuiltinDomain`)** for a `smoothstep` call whose edge values are statically established to violate `edge0 < edge1` in any component (equal **or** reversed). Message shape: `smoothstep requires edge0 < edge1 in every component; component 0 has known edge0 >= edge1.` For a scalar omit the component index. Use the entire **original call** range. Both checker and core must report the same source-mapped diagnostic. At minimum handle supported literal, unary/binary, constructor, grouping and fully constant local-reference forms; WGSL code generation must not expose further accepted compile-time edge expressions to a shader-creation error. The shape-specific runtime-parameter helpers satisfy this condition for edges that cannot be proved invalid in source. Do not claim to prove inequality for runtime-varying expressions.
- An invalid inner argument retains its more specific error and source range (for example, `abs(uniforms)` reports existing `SHDR1203` on `uniforms`); do not replace it with a misleading outer `SHDR1208`. In `abs(dot(uv, coord.xyz))`, the invalid `dot(...)` gets `SHDR1208` over the inner call, not another error over `abs(...)`.
- Keep import/call-boundary diagnostics distinct: an aliased shader import reports existing `SHDR1003` on the import specifier; a namespace shader import `SHDR1004` on the specifier; an unsupported named `"shdr"` import `SHDR1007` on the specifier. An unimported builtin name, a builtin imported from another module, `Math.sin(...)`, or another unsupported call reports `SHDR1106` over the **entire call**, as current syntax validation does. A shader local that shadows an imported builtin name is rejected at its declaration name with existing `SHDR1202`, rather than allowing a local binding to masquerade as the callable. Do not broaden constructor/import rules accidentally.

The following expressions are **individual replacements** for an initializer in an otherwise valid callback with `uv: V2`, `coord.xyz: V3`, and a final valid `vec4` return. None should be tested by depending on target compilation to reject them:

| Expression                                       | Reason                            | Expected Shdr diagnostic / original range |
| ------------------------------------------------ | --------------------------------- | ----------------------------------------- |
| `sin(uv, 1)`, `cos()`                            | Wrong arity                       | `SHDR1208`, full call                     |
| `smoothstep(0, 1, uv)`, `smoothstep(uv, 0, uv)`  | Mixed scalar/vector shapes        | `SHDR1208`, full call                     |
| `smoothstep(uv, coord.xyz, uv)`                  | Mixed vector dimensions           | `SHDR1208`, full call                     |
| `smoothstep(0, 0, 0.5)`, `smoothstep(1, 0, 0.5)` | Known non-increasing scalar edges | `SHDR1209`, full call                     |
| `smoothstep(vec2(0), vec2(0, 1), uv)`            | Known equal edge in component 0   | `SHDR1209`, full call                     |
| `abs(uv, uv)`, `floor()`, `fract(uv, 1)`         | Wrong arity                       | `SHDR1208`, full call                     |
| `min(uv, 1)`, `max(1, uv)`                       | No vector/scalar broadcast        | `SHDR1208`, full call                     |
| `min(uv, coord.xyz)`, `max(coord.xyz, uv)`       | Mixed dimensions                  | `SHDR1208`, full call                     |
| `dot(uv, coord.xyz)`, `dot(uv, 1)`               | Mixed dimensions / scalar operand | `SHDR1208`, full call                     |
| `normalize(1)`                                   | Vector required                   | `SHDR1208`, full call                     |
| `abs(uniforms)`                                  | Invalid inner uniform value       | existing `SHDR1203` over `uniforms`       |
| `abs(dot(uv, coord.xyz))`                        | Invalid inner builtin             | one `SHDR1208` over `dot(uv, coord.xyz)`  |
| `Math.sin(1)`, unimported `sin(1)`               | Unsupported call boundary         | existing `SHDR1106` over full call        |

Positive parity tests must cover **all 42** shapes with ordered arguments, numeric literals where allowed, nested calls, local values and valid final returns. Negative parity must include each rejected category above, import aliases/namespace imports/unsupported named imports, a shadowed callable, wrong-module names, and ordinary TypeScript isolation. Preserve original-source UTF-16 offsets through the shared adapter in VS Code and LSP; the planned CLI checks shader code only.

## Domain and target feasibility

For finite, non-degenerate inputs, GLSL ES 3.00 and WGSL each compiled all 42 explicitly typed shapes in Playwright Chromium **153.0.8010.12** using WebGL 2 and SwiftShader WebGPU. The [raw test](../../packages/core/test/math-builtin-target-feasibility.test.ts) uses every typed result in the fragment output so a call cannot simply disappear as unused code. A separate WebGL pixel and WGSL compute/readback check found `fract(-1.25) ≈ 0.75`, `floor(-1.25) ≈ -2`, `abs(-1.25) ≈ 1.25`, `dot(normalize(vec2(3,4)), normalize(vec2(3,4))) ≈ 1`, and `smoothstep(0,1,0.5) ≈ 0.5`. These checks establish the finite subset, **not** Shdr compiler parity or bit-exact equality across devices.

- `smoothstep` requires `edge0 < edge1` **per component** for portable results. [WGSL](https://www.w3.org/TR/WGSL/#smoothstep-builtin) defines reversed-edge behavior, but GLSL ES 3.00 does not guarantee it; direct equal const-expression edges can be a **WGSL shader-creation error** (vector examples too, as the raw test confirms). Diagnose statically established equal/reversed inputs with `SHDR1209`. For unprovable edges the WGSL generator routes the builtin through typed module-level helpers with non-const parameters. This prevents shader-creation errors from other const-equal source expressions without claiming a usable value when the precondition fails. Runtime-varying edges are accepted by type but carry the same strict-inequality precondition; runtime equality is indeterminate. No general interval proof is claimed. `shdr_internal_` is reserved for these WGSL helper names.
- `normalize` callers must supply a nonzero vector. Zero vectors are **well-typed** but have no portable result guarantee; no zero-check or automatic fallback is implied.
- Scalar `length(x)` resembles `abs(x)` for ordinary finite inputs, but [WGSL](https://www.w3.org/TR/WGSL/#length-builtin) permits a `sqrt(x * x)` evaluation that may overflow or lose accuracy. Avoid identity/bit-equality guarantees.
- `fract(x)` follows the target fractional-part rule (`x - floor(x)` for ordinary finite values); do not substitute JavaScript remainder. WGSL permits a result of **1.0** very near a negative integer. Finite values near integer boundaries, signed zero, NaNs/infinities, and `min`/`max` subnormal/NaN behavior have no bit-exact cross-target or JavaScript `Math` guarantee. Test useful results with tolerances, not exact pixel equality.

**Phase 1 gate (completed):** review this exact contract and passing raw target test before changing public types, virtual checking or core. A portable overload may be narrowed after explicit review, but no required function name may quietly disappear from the single upcoming PR. Raw target acceptance does not prove Shdr accepts any of these calls yet.
