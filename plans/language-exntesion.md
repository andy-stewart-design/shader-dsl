# Proposed language-extension PR sequence

Status: discussion roadmap, **not** an implementation plan or a commitment to accept arbitrary GLSL. The [first-three-PR plan](./language-extension-first-three-plan.md) proposes answers to PRs 1–3's open questions and narrower acceptance gates. The reference cases are the eight numbered fragment shaders discussed in the conversation: **1** cells, **2** orbiting circles/hue, **3** derivative grid, **4** warped palette/grain, **5** color wave, **6** layered noise, **7** plasma, and **8** waveform. The [current language reference](../README.md#accepted-shader-language) remains authoritative until a PR lands. Each accepted slice must agree on a target-neutral f32 contract and keep public types, original-source diagnostics, the TypeScript 7 editor, GLSL/WGSL generation, and real browser pixels in sync.

## Decisions to settle before claiming fidelity

- **Coordinates and host inputs:** Shdr's `coord` and browser `mouse` are top-left-origin; GLSL `gl_FragCoord` is bottom-left-origin. Ports that depend on Y must explicitly reconstruct the original coordinate convention. Agree on mouse coordinates, resolution/DPR, custom-uniform defaults/updates, and time epoch for the reference renders. Do not silently change Shdr's existing coordinate contract.
- **Undefined source behavior:** Shaders **2, 6, and 8** use reversed `smoothstep` edges. GLSL does not guarantee a result there; a faithful _portable effect_ requires agreeing on the intended inverse ramp and rewriting it with ascending edges. Do not promise pixel equivalence to undefined GLSL results.
- **Evidence:** Decide reference frames/input values and tolerant pixel comparisons for transcendental functions, derivatives, and noise. Test both WebGL and presented WebGPU output, not just generated-code validity. These questions need answers for port claims, but need not block unrelated, well-defined language slices.

## Suggested PRs, in order

### PR 1 — Vector expression ergonomics

Add only the composition and component forms needed repeatedly by these shaders: vector-plus/minus-scalar where chosen, `vec4(Vec3<F32>, F32)`, and read-only `.rgba` aliases (or document explicit scalar splats, four-component construction, and `.xyzw` rewrites instead). Keep shader values typed and generated names isolated on both targets. Helps **1–8**; alone it does not complete a shader.

**Decision before implementation:** Should `V + S` / `V - S` implicitly splat the scalar, and should any scalar-on-the-left forms be supported? Specify exact accepted operator directions and constructor forms rather than enabling all mixed arithmetic by accident. Aliases and constructor ergonomics can be omitted if explicit rewrites are preferred.

### PR 2 — Interpolation and thresholds

Add `mix` and `step` with explicit f32 scalar/vector signatures, including the vector endpoints plus scalar blend factor used throughout these examples. Consider scalar-edge/vector-input `smoothstep` as a narrowly scoped addition needed by **2**; WGSL would need same-shape edges. With PR 1 (or explicit splats), this makes **1** a reasonable first full port and unlocks much of **4, 6–8**.

**Decisions before implementation:** Which vector-factor `mix` and vector-input `step` signatures are actually in scope? Will mixed-shape `smoothstep` be supported or will **2** use vector-splatted edges? Keep boolean-mask `mix` and general selection out of this PR. Agree on how the port handles reversed `smoothstep` edges; accepting them syntactically must not be presented as portable fidelity.

### PR 3 — Common math for color and noise

Add the missing f32 math needed by several examples: `sqrt`, `exp`, `clamp`, `pow`, and `tanh`, with only agreed scalar/vector forms. This makes **7** feasible with an inlined grain expression, supplies **5**'s scalar/color transforms aside from matrices, and covers major parts of **6** and **8**. Keep signatures and domain behavior independent of the source GLSL overload list.

**Decisions before implementation:** Which scalar/vector combinations are allowed for `pow` and `clamp`? Define the portable policy for negative bases, zero bases with nonpositive exponents, invalid square roots, and reversed clamp bounds: diagnose demonstrably invalid constants, document dynamic preconditions, or both. Do not imply bit-exact cross-target transcendental results.

### PR 4 — Fragment derivatives

Add a target-neutral fragment-only contract for `dFdx`, `dFdy`, and `fwidth` (mapped to the corresponding WGSL derivative operations). With `mix` from PR 2, **3** can then be ported by inlining its three small helpers, before general function support exists.

**Decisions before implementation:** What source contexts guarantee derivative uniformity, particularly if shader functions or control flow are added later? What level of derivative/pixel agreement between backends is promised? Keep this restricted to the current fragment stage; verify real pixels rather than assuming the operations are interchangeable.

### PR 5 — Static module constants (optional authoring tranche)

Allow a narrowly defined, statically analyzed set of same-file numeric/vector constants to be referenced from shader code without executing authored TypeScript. This preserves the named radii, palettes, and tuning values in **2, 4, 6, and 8**. It is an ergonomics PR: moving constants into the callback or passing values explicitly remains a way to skip it.

**Decision before implementation:** Is module-level constant capture worth supporting, or should shader-local `const` remain the only form? If supported, specify permitted literal/constructor expressions, typing as shader values, dependency order, and diagnostics for dynamic imports or JavaScript evaluation. Do not accidentally admit arbitrary closures.

### PR 6 — Reusable shader functions

Introduce explicitly declared, statically analyzable helper functions so `filmGrain`, `palette`, `noise`, and `waveform` need not be duplicated or expanded into enormous callbacks. This is the main maintainability unlock for **2, 4, 6–8**. It can follow the smaller builtin PRs without blocking them.

**Decisions before implementation:** Choose the authoring form and typed parameter/return contract; whether helpers may access uniforms/coordinates or only explicit arguments; same-file versus imported definitions; recursion/call-graph restrictions; and source-range diagnostics through calls. Helpers must not run as JavaScript or permit arbitrary captures. Start with straight-line f32/vector functions; matrix returns can wait for PR 8.

### PR 7 — Orbit/trigonometry semantics

Cover **2**'s `asin`, two-argument `atan`, and floor-based GLSL `mod`, plus `radians` for **6** if multiplication by a degree-to-radian constant is not the chosen authoring convention. Specify scalar/vector `mod` only where needed. **2** will still depend on matrix support or an explicit scalar-formula rewrite.

**Decisions before implementation:** Map `atan(y, x)` to the correct WGSL argument order and settle zero-axis behavior. Define `mod(x, y)` for negative inputs using GLSL's floor-based result rather than assuming `%` has identical semantics; specify zero divisors and vector/scalar broadcasting. Decide whether `radians` is a public builtin or a documented rewrite.

### PR 8 — Minimal `mat2` values and multiplication

Add only the 2×2 matrix construction, local/helper values, and matrix–vector **and** vector–matrix multiplication used by **2, 5, and 6**. This is a separate type/IR/backend milestone, not an implicit extension to all matrices or GPU resources. A correct implementation should preserve **5**'s particular four coefficients, not substitute a conventional rotation matrix.

**Decisions before implementation:** Specify constructor element/column order, multiplication direction and types, and whether matrices may cross helper boundaries. Confirm GLSL/WGSL layout and evaluation with asymmetric matrices on real pixels. If scalar expansion is preferable for only these examples, this PR can be deferred without claiming general matrix support.

### PR 9 — Eight reference ports and parity review

Collect representative `.shdr.ts` ports and host inputs as integration examples; record which deliberate rewrites replace undefined GLSL behavior and which language features each port requires. Compare both rendered backends under the agreed coordinate and numeric contracts. This is an evidence/review tranche, not a new language feature; individual PRs above should already carry their own focused tests.

**Decision before implementation:** Are these ports intended to match the original GLSL's defined pixels, or the agreed portable _visual intent_ where original behavior is undefined? Set reference frames and tolerances before accepting fidelity claims. If all eight are too broad for one review, land the ports incrementally instead of waiting for PR 9.

## Expected milestones

| After   | Practical outcome, subject to the decisions above                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| PRs 1–2 | **1** becomes a first end-to-end port; **4** can largely be written with inlined grain logic.                               |
| PR 3    | **7** can be ported by inlining its helper; **8** has most expression-level math but still needs reusable functions.        |
| PR 4    | **3** gains the essential derivative behavior.                                                                              |
| PRs 5–6 | **4, 7, 8** become maintainable rather than manually expanded; module constants remain optional.                            |
| PRs 7–8 | **2, 5, 6** gain the missing orbit/matrix vocabulary, with reversed-edge rewrites and other agreed portability constraints. |

The order is a proposal, not a dependency on textures, selection/control flow, new host resources, or a general GLSL parser. A shader port may use explicit splats, callback-local constants, and scalar matrix formulas to bypass optional ergonomics while retaining the same cross-target semantic review.
