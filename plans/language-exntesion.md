# Language-extension roadmap and implementation status

Status: historical discussion roadmap with current implementation status below, **not** an implementation plan or a commitment to accept arbitrary GLSL. The [completed first-three-PR plan](./_completed/language-extension-first-three-plan.md) records PRs 1–3's accepted scope; the [completed reusable-functions plan](./_completed/reusable-functions/plan.md) records PR 6's delivered helper contract. The reference cases are the eight numbered fragment shaders discussed in the conversation: **1** cells, **2** orbiting circles/hue, **3** derivative grid, **4** warped palette/grain, **5** color wave, **6** layered noise, **7** plasma, and **8** waveform. The [current language reference](../README.md#accepted-shader-language) is authoritative for accepted syntax and signatures. Each future slice must agree on a target-neutral f32 contract and keep public types, original-source diagnostics, the TypeScript 7 editor, GLSL/WGSL generation, and real browser pixels in sync.

| Tranche                             | Current status            | Boundary                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 1 — vector ergonomics            | **Implemented**           | Vector/scalar `+` and `-` in both orders, adjacent vector-first `vec3`/`vec4` packing, read-only `rgba` aliases. No general broadcasting or arbitrary constructor shapes.                                                                                                                               |
| PR 2 — `mix`/`step`                 | **Implemented**           | Scalar/vector f32 signatures and a representative **1** port; scalar-edge/vector-input `smoothstep` and boolean-mask `mix` are **not** implemented.                                                                                                                                                     |
| PR 3 — color/noise math             | **Implemented**           | Same-shape scalar/vector `sqrt`, `exp`, `tanh`, `clamp`, `pow`; mixed-shape `clamp`/`pow` are **not** implemented.                                                                                                                                                                                      |
| PR 4 — derivatives                  | **Not implemented**       | No `dFdx`, `dFdy`, or `fwidth` shader builtins.                                                                                                                                                                                                                                                         |
| PR 5 — module constants             | **Not implemented**       | Shader-local constants and static custom-uniform defaults do not permit capturing module-level values inside shader functions.                                                                                                                                                                          |
| PR 6 — reusable functions           | **Implemented**           | `defineShaderFunction` supports typed local and named imported helpers, including transitive calls; explicit arguments only, no captures, recursion, or authored-JavaScript execution.                                                                                                                  |
| PR 7 — orbit/trigonometry           | **Not implemented**       | No shader `asin`, two-argument `atan`, GLSL-style `mod`, or `radians` builtin; `%` is not a substitute.                                                                                                                                                                                                 |
| PR 8 — `mat2`                       | **Not implemented**       | No shader matrix values or matrix multiplication.                                                                                                                                                                                                                                                       |
| PR 9 — eight reference ports/parity | **Partially implemented** | Representative **1** (`ben-day-spotlight`), **4** (`horizon-burn`), and **7** (`plasma`) ports exist; pinned original-GLSL/WebGL/presented-WebGPU comparisons cover **4** and **7**. The eight-port review has not happened; see [reference translations](../apps/vite-basic/src/references/README.md). |

## Decisions to settle before claiming fidelity

- **Coordinates and host inputs:** Shdr's `coord` and browser `mouse` are top-left-origin; GLSL `gl_FragCoord` is bottom-left-origin. Ports that depend on Y must explicitly reconstruct the original coordinate convention. Agree on mouse coordinates, resolution/DPR, custom-uniform defaults/updates, and time epoch for the reference renders. Do not silently change Shdr's existing coordinate contract.
- **Undefined source behavior:** Shaders **2, 6, and 8** use reversed `smoothstep` edges. GLSL does not guarantee a result there; a faithful _portable effect_ requires agreeing on the intended inverse ramp and rewriting it with ascending edges. Do not promise pixel equivalence to undefined GLSL results.
- **Evidence:** Decide reference frames/input values and tolerant pixel comparisons for transcendental functions, derivatives, and noise. Test both WebGL and presented WebGPU output, not just generated-code validity. These questions need answers for port claims, but need not block unrelated, well-defined language slices.

## Roadmap tranches (historical numbering; remaining work is optional)

### PR 1 — Vector expression ergonomics (implemented)

Implemented vector-plus/minus-scalar in **both** operand orders, adjacent vector-first `vec3(Vec2<F32>, F32)` and `vec4(Vec3<F32>, F32)` construction, and read-only `.rgba` aliases. Typed shader values and generated-name isolation are preserved on both targets. This helps **1–8** but alone does not complete a shader. It does not admit general mixed-shape arithmetic, scalar-on-the-left vector multiplication/division, or arbitrary constructor permutations.

### PR 2 — Interpolation and thresholds (implemented; optional `smoothstep` extension not implemented)

Implemented f32 `mix` with scalar or same-shape vector factors for vector endpoints, and `step` with scalar/same-shape vector inputs plus scalar-edge/vector-input forms. **1** has a representative port. Scalar-edge/vector-input `smoothstep`, boolean-mask `mix`, and general selection remain outside this slice. Reversed `smoothstep` edges are syntactically accepted but do not provide portable GLSL fidelity; **2** would need an explicit defined rewrite.

### PR 3 — Common math for color and noise (implemented; mixed signatures not implemented)

Implemented same-shape scalar/vector `sqrt`, `exp`, `clamp`, `pow`, and `tanh`. Provably invalid f32-rounded builtin inputs receive original-call diagnostics; dynamic domain requirements remain caller preconditions, not interprocedural proofs. Mixed scalar/vector `pow` and `clamp` arguments are not supported; authors can use explicit vector splats. **7** now has a helper-based port; **5** still needs matrices or a scalar rewrite, and **6** and **8** need more vocabulary. Do not infer bit-exact cross-target transcendental results.

### PR 4 — Fragment derivatives (not implemented)

Add a target-neutral fragment-only contract for `dFdx`, `dFdy`, and `fwidth` (mapped to the corresponding WGSL derivative operations). With `mix` from PR 2 and the now-implemented reusable helpers from PR 6, **3** could be ported once derivatives exist.

**Decisions before implementation:** What source contexts guarantee derivative uniformity, particularly if shader functions or control flow are added later? What level of derivative/pixel agreement between backends is promised? Keep this restricted to the current fragment stage; verify real pixels rather than assuming the operations are interchangeable.

### PR 5 — Static module constants (not implemented; optional authoring tranche)

Allow a narrowly defined, statically analyzed set of same-file numeric/vector constants to be referenced from shader code without executing authored TypeScript. This preserves the named radii, palettes, and tuning values in **2, 4, 6, and 8**. It is an ergonomics PR: moving constants into the callback or passing values explicitly remains a way to skip it.

**Decision before implementation:** Is module-level constant capture worth supporting, or should shader-local `const` remain the only form? If supported, specify permitted literal/constructor expressions, typing as shader values, dependency order, and diagnostics for dynamic imports or JavaScript evaluation. Do not accidentally admit arbitrary closures.

### PR 6 — Reusable shader functions (implemented)

Top-level `defineShaderFunction` helpers accept explicitly annotated `Expr` parameters and inferred or annotated returns; local and named imported helpers can call other helpers transitively. They take coordinates and uniforms only as explicit arguments, cannot capture module values, and cannot recurse or run as JavaScript. Original-source diagnostics and both target outputs are covered by the [completed plan](./_completed/reusable-functions/plan.md). Matrix values/returns remain outside the language.

### PR 7 — Orbit/trigonometry semantics (not implemented)

Cover **2**'s `asin`, two-argument `atan`, and floor-based GLSL `mod`, plus `radians` for **6** if multiplication by a degree-to-radian constant is not the chosen authoring convention. Specify scalar/vector `mod` only where needed. **2** will still depend on matrix support or an explicit scalar-formula rewrite.

**Decisions before implementation:** Map `atan(y, x)` to the correct WGSL argument order and settle zero-axis behavior. Define `mod(x, y)` for negative inputs using GLSL's floor-based result rather than assuming `%` has identical semantics; specify zero divisors and vector/scalar broadcasting. Decide whether `radians` is a public builtin or a documented rewrite.

### PR 8 — Minimal `mat2` values and multiplication (not implemented)

Add only the 2×2 matrix construction, local/helper values, and matrix–vector **and** vector–matrix multiplication used by **2, 5, and 6**. This is a separate type/IR/backend milestone, not an implicit extension to all matrices or GPU resources. A correct implementation should preserve **5**'s particular four coefficients, not substitute a conventional rotation matrix.

**Decisions before implementation:** Specify constructor element/column order, multiplication direction and types, and whether matrices may cross helper boundaries. Confirm GLSL/WGSL layout and evaluation with asymmetric matrices on real pixels. If scalar expansion is preferable for only these examples, this PR can be deferred without claiming general matrix support.

### PR 9 — Eight reference ports and parity review (partially implemented)

Ports **1**, **4**, and **7** are present; **4** and **7** have pinned original-GLSL/WebGL/presented-WebGPU comparisons. The remaining five reference ports and a coordinated eight-port parity review are not implemented. For any new port, record host inputs, deliberate rewrites of undefined GLSL behavior, and required language features; compare both rendered backends under agreed coordinate and numeric contracts. This is evidence/review work, not a new language feature.

**Decision before implementation:** Are these ports intended to match the original GLSL's defined pixels, or the agreed portable _visual intent_ where original behavior is undefined? Set reference frames and tolerances before accepting fidelity claims. If all eight are too broad for one review, land the ports incrementally instead of waiting for PR 9.

## Remaining reference-port work

The original ordering was a proposal, not a dependency graph: PR 6 landed without PRs 4–5. Ports **1, 4, and 7** exist (with the parity limits in the status table); **2, 3, 5, 6, and 8** have not been established as complete Shdr ports. Derivatives, orbit math, and matrices remain candidates when a concrete port needs them; module constants are optional. A shader port may use explicit splats, callback-local constants, and scalar matrix formulas to bypass optional ergonomics while retaining the same cross-target semantic review. No tranche implies textures, selection/control flow, new host resources, or a general GLSL parser.
