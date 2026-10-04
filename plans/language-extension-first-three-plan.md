# First three language-extension PRs

Status: proposed, actionable sequence for [PRs 1–3 in the roadmap](./language-exntesion.md), **not** approval to widen Shdr to arbitrary GLSL/TypeScript. Each PR is independently reviewable and mergeable. Do not start the next PR to make an incomplete current PR look finished. The [accepted language](../README.md#accepted-shader-language) remains the baseline until a PR merges.

## Decisions shared by all three PRs

- Treat the eight examples as **directional use cases, not an overload specification**. Prefer coherent, portable f32 signature families over a collection of special cases copied from the examples; retain explicit boundaries where a larger family needs separate semantic design. Keep the existing direct named-import boundary, f32-only scalar/vector values, target-neutral typed IR, original-source diagnostics, TypeScript 7 editor/core parity, and separate GLSL ES 3.00/WGSL generators. No source-file execution, ambient `Math.*`, arbitrary closures, boolean/control-flow language, new resources, or compiler imports in static runtime bundles.
- Test shader behavior with **real WebGL pixels and presented WebGPU pixels**, plus type, editor, CLI, Vite and generated-source checks appropriate to each slice. Use finite, non-degenerate values and channel tolerances rather than promise bit-identical transcendentals. Each PR updates the public language reference and exercises its full accepted signature set and representative rejected forms.
- For ports, keep Shdr's top-left `coord` and mouse contract. Explicitly reconstruct bottom-left `gl_FragCoord` coordinates where the source shader requires them; pin representative host inputs and custom-uniform defaults in tests. The first three PRs need not establish pixel fidelity for all eight shaders.
- Reversed `smoothstep` edges remain syntactically accepted but **not** portable. Shader **2**'s inverse ramp can use ascending, explicitly vector-splatted edges and `1 - smoothstep(...)`; this sequence does not add a reverse-edge guarantee or scalar-edge/vector-input `smoothstep` overload.

## PR 1 — Vector arithmetic, composition and component aliases

**Scope.** Keep all existing arithmetic forms and add f32 scalar/vector `+` and `-` **in both operand orders** (`Vn + S`, `S + Vn`, `Vn - S`, `S - Vn`) for `n = 2–4`. Preserve subtraction order; WGSL must broadcast the scalar where it needs matching vector shapes, without putting backend-specific splats in the IR. Add the adjacent right-scalar constructor family `vec3(V2, S)` and `vec4(V3, S)`; do not silently admit all permutations of constructor components. Add complete read-only `.rgba` swizzle families (one to four components, including repeats/chaining) as aliases for `.xyzw` of the same vector size; keep mixed alphabets such as `.xr` and swizzle writes invalid.

**Open questions answered.** Both operand orders make `+`/`-` a predictable arithmetic family, rather than selecting only the examples' spelling. Multiplication/division retain their existing, separately documented forms; broadening them is **not** implied by this PR. Adjacent vector-plus-scalar packings are a coherent constructor slice, not a special case for `.rgb`. Color aliases apply only to existing components (`.a` needs a Vec4); normalize them to the existing component indices so target emitters remain agnostic to the source alphabet.

**Review gate.** Positive and negative types, mapped editor/core diagnostics and hovers, GLSL/WGSL expression results (including nested/local references), and browser pixels must agree. Check operand order using noncommutative subtraction; reject wrong dimensions, other constructor packings, mixed/invalid swizzles and assignments. The pre-existing operators and generated-name isolation must still pass.

## PR 2 — `mix` and `step`, then shader 1 as the first port

**Scope.** Importable direct-call f32 signatures:

| Call                                        | Accepted result           | Excluded for now            |
| ------------------------------------------- | ------------------------- | --------------------------- |
| `mix(S, S, S)`                              | `S`                       | Boolean-mask mix            |
| `mix(Vn, Vn, S)` and `mix(Vn, Vn, Vn)`      | `Vn`                      | Mixed endpoint dimensions   |
| `step(S, S)`, `step(Vn, Vn)`, `step(S, Vn)` | `S` or `Vn`, matching `x` | Vector edge with scalar `x` |

`S` is an f32 scalar expression and each `Vn` has one fixed dimension (2–4). Use the targets' native interpolation/threshold behavior for accepted finite inputs. `step(edge, x)` is zero for `x < edge`, one otherwise at ordinary finite values; it is not an invitation to add comparisons or `if`. Keep existing same-shape `smoothstep` signatures. Include a representative Shdr port of **shader 1**, with `u_dpi`, `u_spread` and `u_blur` expressed as static-default custom uniforms and with the GLSL bottom-left coordinate and mouse conventions explicitly accounted for. If no original host values are available, call the fixture a **representative portable port**, not a pixel-exact reproduction of unspecified input frames.

**Open questions answered.** Include both standard vector interpolation-factor shapes: scalar and same-size vector, without adding boolean-mask selection. Offer scalar, same-shape vector and scalar-edge/vector-input `step`; broadcast the scalar edge on WGSL where required, but do not invent vector-edge/scalar-input semantics. Do not add scalar-edge/vector-input `smoothstep` yet: explicitly splatted ascending vector edges already express shader **2**'s _intended_ inverse ramp, whereas its original reversed edges are undefined in GLSL. Verify every accepted shape in raw WebGL/WGSL before implementing public types; use a tested target-specific lowering only for an agreed portable broadcast.

**Review gate.** Accepted/rejected calls, unimported/aliased calls and nested bad arguments must agree in public types, TS7 QuickInfo/diagnostics, core, CLI and both emitters. Test scalar/vector `step` on both sides **and at** the threshold, both vector `mix` factor shapes, real two-backend shader-1 pixels at multiple inputs (including no mouse versus active mouse), and initial/update custom-uniform host values. Preserve the static-bundle compiler-exclusion check. Do not claim shader **2** is portable as written.

## PR 3 — `sqrt`, `exp`, `clamp`, `pow`, `tanh`

**Scope.** Only these f32 signatures; `T` is `S` or a single `Vn` (size 2–4):

| Call                           | Accepted result | Excluded for now                                        |
| ------------------------------ | --------------- | ------------------------------------------------------- |
| `sqrt(T)`, `exp(T)`, `tanh(T)` | `T`             | Other numeric kinds                                     |
| `clamp(T, T, T)`               | `T`             | Scalar bounds with vector input                         |
| `pow(T, T)`                    | `T`             | Scalar exponent with vector base and other mixed shapes |

These same-shape scalar and V2/V3/V4 families are a consistent initial math contract, not signatures copied solely from the examples. They supply **7**'s `sqrt` and **5**'s `tanh` expressions, and major pieces of **6**/**8**; matrix syntax and reusable helpers remain later PRs. Mixed scalar/vector `clamp` bounds and `pow` exponents/bases require additional broadcast/domain design and are deferred as a family, not excluded merely because a given example omits them. No `Math.*` or implicit call-site splats: authors can use `vecN(scalar)` where a vector argument is needed.

**Open questions answered: portable domain.** Require nonnegative `sqrt` inputs; for `pow`, require a nonnegative base and exclude `0` with a nonpositive exponent (including `0^0`); for `clamp`, require `low <= high` component-wise (equal bounds are allowed). Diagnose values **provably** outside these domains after f32 rounding using conservative source/local constant analysis, at the original call; do not reject merely possible invalid runtime inputs. Reuse the existing invalid-builtin-domain diagnostic category (`SHDR1209`) for known domain violations while retaining its equal-edge `smoothstep` behavior; wrong signatures remain `SHDR1208`. Document the preconditions for dynamic inputs. `exp` can overflow at runtime even with finite inputs; do not claim all outputs are finite or bit-exact. Reject **unambiguously** out-of-f32 constant results with an original-source domain diagnostic, but do not invent proofs from approximate `exp`/`pow` evaluations near a boundary. For constant-folding cases that cannot safely be classified, use a scoped generated parameter helper if WGSL would otherwise reject shader creation; validate this in the raw-target gate. Unknown dynamic results remain caller preconditions, not compiler guarantees.

**Review gate.** Freeze this finite signature/domain table against raw target feasibility first; test wrong arity/shape, scalar and vector forms (V2/V3/V4), positive/negative domain examples, nested calls and original ranges through types/editor/core/CLI. Compile both targets and compare finite non-degenerate rendered pixels, including **7** with its small grain helper inlined if useful. Verify constant inputs cannot unexpectedly fail WGSL shader creation or escape source diagnostics as a generation exception. Update docs with dynamic-domain limits and numeric tolerances, then run the workspace build, checks, browser suites and formatting before PR review.

## Completion boundary

After PR 3, **1** should have a representative two-target port; **4** and **7** can be expressed by inlining their helpers. Shaders **2, 3, 5, 6, 8** still require later tranches (derivatives, reusable functions, orbit math, or matrices). Do not treat these three PRs as an eight-shader fidelity milestone. If a raw target probe invalidates an accepted signature, stop to review the contract rather than widening the language or producing target-specific shader semantics without a decision.
