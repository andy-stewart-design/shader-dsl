# Fragment derivatives specification

## Status

- Readiness: **Implementation verified; delivery pending.** Phases 0–3 and Step 3.2 final documentation/regression review are verified. Merge and publication remain pending; this status does not authorize release.
- Blocking decisions: None for the scoped Chromium SwiftShader gates. The signed-Y convention is implemented and presented WebGL/WebGPU pixels pass; broader hardware behavior, reference shader 3 fidelity, and the standard TypeScript provider hover on ordinary `.ts` files remain untested.
- Source: The derivative discussion in this conversation, [PR 4 of the language-extension roadmap](../language-exntesion.md#pr-4--fragment-derivatives-implemented-pr-23-open--merge-pending), and the [accepted shader language](../../README.md#accepted-shader-language). A complete port or fidelity claim for reference shader **3** is separate work.

## Problem and intended outcome

Fragment shaders need screen-space derivatives for grid width, antialiasing, and similar effects. Authors can call `dFdx`, `dFdy`, and `fwidth` on supported f32 shader expressions in a fragment or reusable helper, with one meaning across generated GLSL ES 3.00 and WGSL. The shaders should compile and produce comparable rendered behavior on real WebGL 2 and presented WebGPU without executing authored TypeScript.

**Central invariant:** signed derivatives use Shdr's existing top-left screen coordinates: positive X points right and positive Y points down. A direct mapping to native GLSL `dFdy` would violate that invariant; backend output may differ in spelling and sign to preserve the authored meaning.

## Scope

Included:

- Direct-imported, fragment-stage `dFdx`, `dFdy`, and `fwidth`, each with unary `Expr<F32>` and same-shape `Expr<Vec2/3/4<F32>>` input/result signatures. Vector results are component-wise.
- Calls in supported straight-line fragment callbacks and local/imported `defineShaderFunction` helpers used by fragments, including helper-only defining modules checked through existing graph paths.
- Original-source diagnostics, public types, editor/CLI/Vite/REPL parity, generated targets, and real rendered WebGL/presented-WebGPU acceptance.

Non-goals:

- Vertex or compute derivatives, new shader stages, authored branches/loops, a general GLSL parser, coarse/fine variants, explicit texture-gradient sampling, or changes to implicit texture-sampling behavior.
- Matrix, texture-handle, mixed-shape, or multi-argument derivative signatures; general value broadcasting or widening of other builtins.
- Completing reference shader **3**, matching reference GLSL text, or claiming exact derivative values at discontinuities, framebuffer boundaries, or across GPUs.

## Current behavior and evidence

Implementation and verification status after Step 3.2:

- `packages/shdr` exports compile-only scalar/Vec2/3/4 overloads; core validates exact unary shapes and does not constant-fold derivative values.
- Both generators emit the specified native calls; GLSL wraps the result as `(-dFdy(x))` so nested authored negation remains valid GLSL, and WGSL maps to `dpdx`/`dpdy`.
- Direct and nested imported-helper graphs pass source-owned diagnostics, artifact invariance, GLSL link, and WGSL pipeline checks. No graph implementation changes were required.
- Phase 2 consumer gates pass: TypeScript 7 adapter and real VS Code extension tests, project/CLI/Vite graph and static-bundle tests, and REPL browser edit/failure/recovery checks. The REPL verified that invalid derivative arity and missing direct imports preserve the prior WebGL and WebGPU previews, and that valid source restores both targets. The standard TypeScript provider's hover on ordinary `.ts` files remains untested; see [plan.md](plan.md) for the narrower editor evidence.
- Raw WebGL/offscreen WebGPU feasibility probes and the Phase 3.1 presented WebGL/WebGPU pixel gate validate signed Y and nonsaturating vector-width lanes on Chromium SwiftShader. This does not promise results on other hardware or at edges/discontinuities; see [plan.md](plan.md), [evidence/phase-0.md](evidence/phase-0.md), and [evidence/rendered-acceptance.md](evidence/rendered-acceptance.md).
- Fragment/helper syntax remains straight-line and helpers are statically lowered in their defining files. Future non-uniform control flow or stages require a separate contract. Existing artifact, binding, static-consumer and renderer lifecycle constraints remain in force.
- Final direct package/unit, browser verifier, Vite, REPL, editor, build/check, formatting, and diff gates pass. The aggregate `pnpm test` was intentionally not run because its hooks install Chromium; its direct installed-browser equivalents pass. Vite invalid-edit evidence remains transform-only, and ordinary `.ts` standard-provider hover remains untested.

## Requirements and invariants

- **R1 — Exact authoring boundary:** The three functions have exactly the unary scalar and Vec2/3/4 f32 signatures above (twelve signatures). Types, core validation, editor QuickInfo, and helper calls agree. Calls must follow existing direct named-import rules; unsupported argument counts/shapes are not admitted through a permissive fallback.
- **R2 — Top-left signed meaning:** `dFdx(x)` measures change to the right and `dFdy(x)` measures change downward in Shdr screen coordinates. For ordinary interior fragments, `dFdx(coord.x)` and `dFdy(coord.y)` are approximately `+1`; derivatives of bottom-left-reconstructed Y have the opposite sign. This rule applies equally inside helpers and to every vector lane, without trying to recognize particular argument expressions.
- **R3 — Width meaning:** `fwidth(x)` is the component-wise screen-space width, approximately `abs(dFdx(x)) + abs(dFdy(x))` for ordinary smooth inputs. The signed-Y adjustment does not change its magnitude. There is no claim of identical fine/coarse quad selection or exact cross-GPU pixels.
- **R4 — Stage and uniformity:** Calls are valid only in the existing fragment-stage straight-line shader language, including reachable fragment helpers. No authored control flow or stage relaxation is introduced. If future control flow or shader stages add non-uniform execution, their derivative uniformity rules require a separate contract rather than silently inheriting this permission.
- **R5 — Validation and failure:** Unsupported arity/shape, missing direct imports, forbidden captures, and invalid helper/stage use retain actionable original-file/range diagnostics through existing boundaries, without exceptions or a usable candidate artifact. Derivative results are GPU screen-space operations, not compile-time JavaScript evaluations or promised constant-folded values. Dynamic or discontinuous inputs do not gain an invented fallback result.
- **R6 — Target and tooling parity:** Accepted source produces valid GLSL ES 3.00 and WGSL shader/pipeline artifacts with the same target-neutral meaning, including helper ownership and edits. TypeScript 7, CLI, Vite, and browser compilation/REPL agree on accepted forms and authored diagnostics; ordinary `.ts` ownership remains unchanged.
- **R7 — Isolation and compatibility:** Preserve existing shader expression grouping, f32 input policy, safe generated names, artifact JSON/metadata/bindings, custom uniforms/textures, renderer lifecycle and failed-edit preservation. No authored `.shdr.ts` module runs as JavaScript, and a static Vite consumer does not gain compiler code or a new runtime derivative API.
- **R8 — Real-target evidence:** Acceptance requires real GLSL program link, WGSL module/pipeline validation, and rendered WebGL 2 and **presented** WebGPU pixels at pinned finite inputs, non-square canvas dimensions, and declared tolerances. Capability unavailability blocks this gate; generated text or mocks cannot replace rendered evidence.

## Behavior and contracts

Let `S = Expr<F32>` and `Vn = Expr<VecN<F32>>` for each `n` in `2 | 3 | 4`:

| Function | Accepted calls and result |
| -------- | ------------------------- |
| `dFdx`   | `(S) → S`, `(Vn) → Vn`    |
| `dFdy`   | `(S) → S`, `(Vn) → Vn`    |
| `fwidth` | `(S) → S`, `(Vn) → Vn`    |

These are fragment derivatives, not derivatives with respect to a function argument or a time uniform. An argument's value is evaluated as a shader expression over neighboring fragment invocations. Within the defined smooth, interior test domain, target generation has the following semantics:

| Authored call | GLSL ES 3.00 | WGSL        |
| ------------- | ------------ | ----------- |
| `dFdx(x)`     | `dFdx(x)`    | `dpdx(x)`   |
| `dFdy(x)`     | `-dFdy(x)`   | `dpdy(x)`   |
| `fwidth(x)`   | `fwidth(x)`  | `fwidth(x)` |

The GLSL negation applies **to the native derivative result**, with expression grouping preserved; it is not a special-case substitution for `coord.y`. Thus `dFdy(coord.y)` is approximately `+1` on both targets, while `dFdy(uniforms.resolution.y - coord.y)` is approximately `-1` on both. The latter differs from directly calling native GLSL `dFdy(gl_FragCoord.y)`; a future reference port that intends native bottom-left signed behavior must explicitly adapt its Shdr expression. `fwidth` is unsigned and needs no backend sign flip. Scalar/vector derivative results remain f32 expressions under existing precision and numeric policy.

Source such as `dFdy(1)`, `fwidth(coord.xy)`, and a helper taking a typed vector expression is valid. The fact that a constant field is mathematically flat does not require Shdr to evaluate the derivative on the CPU. Calls with no argument, extra arguments, mismatched or non-f32 types, a matrix or texture handle, or an unimported/aliased function name are invalid through the existing signature/import rules. No host-settable derivative mode, persistent state, or extra artifact field is added.

Actual GPU derivatives are estimated from neighboring fragment invocations. The contract makes no portable numeric or visual promise across discontinuities, primitive edges, coverage changes, tiny gradients dominated by precision, or hardware-selected coarse/fine differences. Existing invalid edits must keep a previously installed shader where the REPL/runtime already provides that behavior. Shader compilation errors remain source diagnostics; device/target failures remain backend failures, not fabricated source locations.

## Ownership and boundaries

The `shdr` source-language package owns the concrete compile-only overloads. Core owns target-neutral signature validation, diagnostics, typed shader expressions, and backend-specific emission, including the signed GLSL Y adjustment. Helper graph lowering must preserve defining-file ownership without acquiring a stage-independent derivative capability. Editor, CLI, Vite, and browser compilation must present the same core contract rather than implementing independent CPU derivatives. Renderers consume only the existing compiled artifact and do not calculate derivatives, add bindings, or execute source modules.

## Acceptance criteria

| ID  | Requirement(s) | Starting condition / action                                                                                                                                                  | Expected outcome                                                                                                                                                                                                            | Verification approach                                                                                               |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| AC1 | R1, R5, R6     | Author all twelve accepted calls on scalar and distinct-lane Vec2/3/4 inputs; use them in a fragment, a local helper and an imported helper-only module.                     | Public types, core result shapes and editor hovers agree; the helper keeps its defining-file ownership and both targets compile.                                                                                            | Type-level, core/graph, TypeScript 7 editor, real GLSL-link/WGSL-pipeline checks.                                   |
| AC2 | R2, R3, R8     | Render an interior-pixel shader probing `dFdx(coord.x)`, `dFdy(coord.y)`, `dFdy(resolution.y - coord.y)`, and `fwidth` on a pinned non-square canvas.                        | Right/down slopes are approximately `+1`, reconstructed-bottom-left signed Y approximately `-1`, and width approximately `1` on WebGL and presented WebGPU; samples distinguish a missing or double GLSL sign flip.         | Real browser pixel/readback and presented-WebGPU samples with stated channel encodings, tolerances and environment. |
| AC3 | R1, R4, R5     | Call derivatives with wrong arity/shapes, without the required import, on matrix/texture values, and in invalid captures or unsupported shader syntax.                       | Each invalid source fails at the authored call/use under its appropriate existing diagnostic category, with no artifact, JavaScript evaluation or misleading generated-file cascade.                                        | Core negative and public/editor/CLI parity fixtures; no new authored control-flow grammar.                          |
| AC4 | R2, R3, R4, R8 | Render smooth varying scalar/vector expressions and a derivative inside a reachable imported helper, away from borders and discontinuities.                                  | Generated targets compile/link and produce the same intended lane/sign/width behavior within recorded tolerances; no promise of bit-identical target results is inferred.                                                   | Real Chromium WebGL 2 and presented-WebGPU pixels plus target validation; record target limitations separately.     |
| AC5 | R5, R6, R7     | Use a valid/invalid derivative edit through the TypeScript 7 editor, project CLI/Vite graph, browser compiler, and single-textarea REPL.                                     | Authored diagnostics and hovers refresh without changing ordinary `.ts` ownership; imported helper errors remain in the defining source; REPL does not fetch shader imports and an invalid edit preserves healthy previews. | Adapter/project/consumer tests, real editor interaction, and REPL browser checks.                                   |
| AC6 | R6, R7         | Compile a shader combining derivatives with existing math, custom uniforms, textures and helpers; inspect the artifact and static Vite bundle and rerun old renderer suites. | Existing artifact schema, defaults/resource/binding rules and shader grouping remain intact; static output does not execute authored source or bundle the compiler; old rendered cases remain valid.                        | Core artifact tests, static bundle inspection and real runtime regression.                                          |

## Assumptions

- **Bounded signatures and helper allowance:** The prior interview wrap-up proposed scalar/Vec2/3/4 signatures and helpers in the current straight-line fragment-only language; the user explicitly agreed to WGSL-like top-left signed behavior and compensating GLSL output. Validate the inferred helper-uniformity assumption by compiling/linking actual helper cases on both targets before declaring acceptance.
- **Native derivative magnitude where signed orientation does not matter:** Native `fwidth` is intended to satisfy the component-wise width contract within ordinary GPU accuracy. Confirm the assumption on real target probes rather than treating algebra alone as browser evidence.
- **Existing transport and failure policies apply:** No new artifact or renderer API is expected. Validate this with static-consumer and invalid-edit checks; this is not evidence that those checks have already run.

## Risks and open decisions

- Blocking: None for specification readiness. If a real WGSL or GLSL helper-uniformity probe contradicts the straight-line contract, stop for scope review rather than silently excluding helpers or emitting backend-specific semantics.
- Non-blocking: Derivative quad choice, edges, discontinuities, texture LOD interactions, precision, and zero-sign details can differ across GPUs. Test smooth interior values with finite pinned inputs and tolerances, and report any unsupported target as blocked rather than passed.
- Non-blocking: A GLSL reference using native bottom-left `dFdy` will require an explicit sign-aware port; derivative language acceptance alone is not a claim of reference shader **3** fidelity.

## Deferred work

Reference shader **3** translation/parity, derivative use under future divergent control flow, vertex/compute stages, coarse/fine variants, implicit/explicit texture-gradient changes, and broad cross-hardware visual fidelity require separate decisions and acceptance contracts.
