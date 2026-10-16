# Orbit/trigonometry semantics specification

## Status

- Readiness: **Ready for implementation**. Scope and signature families are agreed; native forwarding has been selected for binary `atan` after the comparison spike. This is a proposed behavioral contract, not an implemented feature.
- Blocking decisions: None for the binary `atan` candidate. Exact signed-zero-sensitive axes, origin, and very small-input precision remain outside the portable value guarantee rather than being normalized by a custom helper.
- Source: The PR 7 interview in this conversation and [the language-extension roadmap](../language-exntesion.md#pr-7--orbittrigonometry-semantics-not-implemented). The [current accepted language](../../README.md#accepted-shader-language) and [completed mixed-shape math contract](../_completed/mixed-shape-clamp-pow/plan.md) establish compatibility constraints.

## Problem and intended outcome

Shader authors cannot currently express inverse-trigonometric calculations, named degree/radian conversions, or GLSL floor-based wrapping through Shdr builtins. These operations are useful for orbit and hue calculations, including the eventual translation of reference shader 2, but their semantics must not depend silently on which backend renders the shader.

Authors should be able to use the agreed scalar/vector signatures in fragments and reusable helpers, receive original-source diagnostics for invalid calls, and render the same defined mathematical operation on WebGL and WebGPU within documented numerical tolerances. Completing the orbiting-circles reference port is not the acceptance goal.

**Central invariant:** one authored call has one target-neutral f32 meaning. Backend spelling or generated helpers may differ, but types, valid-input behavior, diagnostics, and the existing artifact/runtime boundaries must agree.

## Scope

Included:

- Public `asin`, `acos`, unary and binary `atan`, `mod`, `radians`, and `degrees` signatures specified below: six builtin names and 31 concrete argument-shape signatures.
- Scalar and component-wise Vec2/3/4 behavior, with vector/scalar divisors specifically supported for `mod`.
- A native-versus-guarded comparison spike before settling binary `atan` axis semantics.
- Public authoring types, target-neutral checking, domain diagnostics, both generators, TypeScript 7 editor support, CLI/Vite/browser-compiler integration, documentation, and rendered WebGL/presented-WebGPU evidence delivered together.

Non-goals:

- The complete orbiting-circles port, new reference-fidelity claims, or rewriting that reference's reversed-edge `smoothstep`.
- `tan`, a public `atan2` alias, general broadcasting, scalar/vector `mod`, mixed-shape binary `atan`, or mixed vector dimensions.
- `%`, matrices, module-value capture, new authored control flow, new numeric kinds, other shader stages, or unrelated builtin signature extensions.
- Bit-identical transcendental results, a universal cross-GPU precision promise, or defined fallback pixels for invalid runtime inputs.

## Current behavior and evidence

The following observations come from static inspection; no new runtime or implementation verification was performed to author this spec.

- `packages/shdr/src/math.ts` defines concrete scalar/vector overloads and compile-only runtime markers for existing builtins; `packages/shdr/src/index.ts` exports them. None of the six new names is currently exported as a math builtin.
- `packages/core/src/shader-builtin.ts` owns the finite builtin vocabulary and accepted argument shapes. `packages/core/src/lower-shader-syntax.ts` resolves typed calls and reports `SHDR1208` for invalid builtin signatures and `SHDR1209` for supported locally provable domain violations.
- `packages/core/src/evaluate-shader-constant.ts` conservatively tracks known f32 components, including partially known vectors, without generally approximating target-dependent transcendental results. Authored helper calls do not receive interprocedural constant/domain propagation.
- `packages/core/src/generate-glsl-expression.ts` and `generate-wgsl-expression.ts` translate existing builtin calls. WGSL already uses parameterized helpers for selected domain-sensitive operations; existing mixed-shape `clamp`/`pow` retain scalar arguments in IR and expand them at generation boundaries.
- Existing verification seams include `packages/core/test/pr3-parity.test.ts`, `math-builtin-target-feasibility.test.ts`, `mixed-shape-clamp-pow-generated.test.ts`, `packages/language-service/test/mixed-shape-editor.test.ts`, and `packages/runtime/test/verify-pr3-math.mjs`. Their presence is not evidence that the new operations work.
- `apps/vite-basic/src/references/circles-circling.frag` uses scalar `asin`, binary `atan`, and vector/scalar `mod`. It also uses `mat2` and reversed-edge `smoothstep`, so builtin delivery alone must not be represented as a completed portable reference port.
- Documentation consulted during the interview describes GLSL floor-based `mod` and native angle operations: [GLSL ES `mod`](https://docs.gl/el3/mod), [`atan`](https://docs.gl/el3/atan), [`asin`](https://docs.gl/el3/asin), and [`radians`](https://docs.gl/el3/radians). [WGSL `atan2`](https://www.w3.org/TR/WGSL/#atan2-builtin) takes `(y, x)` and documents unbounded error at the origin and for certain small inputs. Native spelling is known; portable axis behavior is not established by that fact.

## Requirements and invariants

- **R1 — Exact public signature boundary:** Accept exactly the new signatures in the table below, using direct named imports from `"shdr"` and the existing `Expr` value types. Public overloads, core checking, result types, and editor hovers must agree. The same calls must be available in fragments and supported local/imported reusable helpers.
- **R2 — Angle operations:** `asin`, `acos`, unary `atan`, `radians`, and `degrees` implement their specified mathematical operations component-wise for vectors, subject to f32 numerical limits and documented tolerances. Their meanings must not vary by backend.
- **R3 — Binary angle operation and decision gate:** Binary `atan(y, x)` selects the angle using both argument signs rather than merely evaluating unary `atan(y / x)`. Both backends preserve argument order. Axis guarantees and any additional input restrictions must be selected from comparison evidence before final acceptance, not silently inherited from one native implementation.
- **R4 — Floor-based wrapping:** `mod` implements `x - y * floor(x / y)`, not truncation-based remainder. Negative dividends and nonzero negative divisors are supported. A scalar divisor broadcasts only at this call boundary; each result lane uses the corresponding dividend and the same scalar divisor.
- **R5 — Validation and failure:** Wrong shapes or arity report `SHDR1208` on the original authored call. Locally provable violations of the finalized domain contract report `SHDR1209` on that call, with no usable artifact. Domain analysis uses f32-rounded known values, detects a known-bad lane even if other lanes are unknown, and leaves unknown dynamic values as caller preconditions. No automatic clamping or invented fallback values are introduced.
- **R6 — Backend acceptance and numerical parity:** Accepted source with valid, ordinary finite inputs produces compilable GLSL ES 3.00 and WGSL and renders tolerance-consistent results. WGSL constant evaluation must not introduce a backend-only rejection for source accepted under the shared checking policy. Numeric range/precision limitations must be documented rather than hidden by a claim of universal finite results.
- **R7 — Tooling parity:** CLI, Vite, the browser compiler/REPL, and the TypeScript 7 editor path expose the same signature and domain behavior. Diagnostics identify original authored files/ranges; hovers and diagnostics refresh after edits. Existing ownership of ordinary `.ts` files remains unchanged.
- **R8 — Compatibility and ownership:** Preserve existing accepted signatures/operators, f32 expression grouping, collision-safe generated names, helper/module rules, artifact schema, bindings, custom-uniform defaults/updates, and renderer lifecycle. Neither compilation nor rendering executes authored shader JavaScript. A static artifact consumer must not acquire the compiler because these builtins are used.
- **R9 — Evidence and claims:** Completion requires real rendered WebGL and presented WebGPU evidence for the new operations, not generated-source or module-compilation assertions alone. Record inputs, tolerances, environment, and unavailable capabilities explicitly; native observations on one GPU must not be promoted into specification guarantees or original-reference fidelity claims.

## Behavior and contracts

### Authoring and signatures

Let `S = Expr<F32>` and `Vn = Expr<VecN<F32>>` for `n` in `2 | 3 | 4`. Every occurrence of `Vn` within a call has the same dimension.

| Builtin                              | Accepted operands → result                                    |
| ------------------------------------ | ------------------------------------------------------------- |
| `asin`, `acos`, `radians`, `degrees` | `(S) → S`, `(Vn) → Vn`                                        |
| `atan`                               | `(S) → S`, `(Vn) → Vn`, `(S y, S x) → S`, `(Vn y, Vn x) → Vn` |
| `mod`                                | `(S x, S y) → S`, `(Vn x, Vn y) → Vn`, `(Vn x, S y) → Vn`     |

There are 16 unary signatures across `asin`/`acos`/`radians`/`degrees`, eight across the two `atan` arities, and seven for `mod`: **31 new signatures**. No permissive catch-all signature may erase rejected combinations.

Examples of accepted shape combinations include `atan(coord.xy)`, `atan(coord.y, coord.x)`, and `mod(coord.xyz, 6)`. Rejected combinations include `atan(coord.xy, 1)`, `mod(1, coord.xy)`, `mod(coord.xy, coord.xyz)`, and `radians(1, 2)`. These examples concern typing; dynamic values still have to satisfy numeric preconditions.

A scalar divisor in vector `mod` remains scalar in target-neutral call IR. Backend-specific splats or internal functions must not widen general operator/builtin broadcasting. The operation's authored argument order and f32 grouping must survive generation; generating a floor-based helper must not expand a call argument into repeated authored expression evaluation.

### Mathematical meaning and domains

- `asin(x)` returns the inverse sine in radians, in `[-π/2, π/2]`. Each input must be in `[-1, 1]`, including the endpoints.
- `acos(x)` returns the inverse cosine in radians, in `[0, π]`. Each input must be in `[-1, 1]`, including the endpoints.
- Unary `atan(x)` returns the inverse tangent in radians, in `[-π/2, π/2]`. It does not preserve the quadrant information of a separate `(y, x)` pair.
- `radians(d)` converts degrees to radians, mathematically `d * π / 180`; `degrees(r)` converts radians to degrees, mathematically `r * 180 / π`. These equations define the conversion, not an exact constant spelling, evaluation grouping mandate, or bit-exact round-trip guarantee. Inputs/results remain subject to f32 range limits.
- Binary `atan(y, x)` returns a quadrant-aware angle in `[-π, π]` for ordinary finite, nondegenerate inputs. **Native forwarding is selected:** GLSL uses `atan(y, x)` and WGSL uses `atan2(y, x)`. No custom axis helper or target-independent signed-zero normalization is emitted. `(0, 0)`, signed-zero-sensitive axis pairs, and very small inputs are caller preconditions without a portable value guarantee; no fallback value is invented. Ordinary non-signed axis observations and branch-cut directions remain target observations rather than claims of universal bit identity.
- `mod(x, y)` requires a nonzero divisor in every lane. For ordinary representable inputs, examples are `mod(-1.5, 1) = 0.5`, `mod(1.5, -1) = -0.5`, and `mod(-1.5, -1) = -0.5`. A known zero divisor is invalid even when its dividend is unknown. No unconditional range or accuracy promise is made for numerically extreme inputs whose floor-based intermediates overflow or lose substantial precision.

Known non-finite compound arguments follow the existing domain-sensitive math policy. A source expression that rounds to a valid f32 endpoint is checked as that endpoint, not as its original JavaScript double. Unknown runtime inputs are not normalized or clamped. Generated internal guards, if chosen, do not admit authored branching or make invalid dynamic values valid.

Helper parameters remain dynamic for domain analysis. A directly written `asin(2)` is rejected, including inside a helper definition; a valid helper definition `angle(x) = asin(x)` does not introduce an interprocedural proof that rejects `angle(2)`. The caller still owns the precondition. Constant analysis must not infer backend-exact transcendental values from JavaScript approximations.

### Binary `atan` comparison contract

The comparison spike selected native forwarding rather than an explicit-axis-handling candidate. The guarded candidate remains evidence only; it is not part of the implementation contract. Native GLSL `atan(y, x)` and WGSL `atan2(y, x)` preserve authored argument order and agree for the ordinary finite cases covered by the probe. Exact signed-zero-sensitive axes, origin, and very small-input precision are outside the portable value guarantee.

The comparison must expose:

- All four quadrants using asymmetric values that reveal swapped arguments or lost quadrant information.
- Exact positive/negative axes, approach from each side, signed zero, very small inputs, and the negative-axis branch cut. Include `(0, 0)` as exploratory evidence only.
- Numeric observations as well as a rendered angle/hue field that makes seams visible. Explain angular equivalence at the branch cut rather than treating `-π` and `π` as unrelated directions.
- Generated-code complexity and any observed reasons to investigate performance. A performance benchmark is not a prerequisite unless the evidence warrants it.
- Native specification guarantees separately from observed behavior, with the tested GPU/browser environment identified.

The resulting decision is native forwarding with the restricted portable value domain documented above. All vector lanes follow the same native scalar mapping. No unconditional signed-zero, origin, or small-input axis guarantee is accepted merely because both tested backends happened to agree on the observed software path.

### Failure and existing application state

A source failure produces existing source-located diagnostics and no usable candidate artifact. Existing REPL invalid-edit handling must continue preserving the last successful render. Backend failures remain backend failures, not fabricated original-source diagnostics. This feature adds no new cancellation, permissions, persistence, host inputs, or renderer state transitions.

## Ownership and boundaries

The `shdr` package owns the concrete compile-only authoring signatures. Core owns target-neutral meaning, domain checks, original-source ranges, conservative constant analysis, and target generation. Generated helpers are implementation details, not authored JavaScript or new language constructs. The TypeScript 7 adapter and CLI/Vite/browser integrations present that shared contract rather than inventing independent overloads or runtime fallbacks.

Runtime renderers continue to consume the existing JSON artifact and supply existing inputs. They do not implement trigonometry in host JavaScript, add bindings for these operations, or alter another renderer's values or lifecycle. Compiler-only code must remain outside static runtime consumers.

## Acceptance criteria

These are proposed verification obligations, not results already obtained.

| ID  | Requirement(s) | Starting condition / action                                                                                                                                                                                 | Expected outcome                                                                                                                                                                                                                                                                                                                   | Verification approach                                                                                             |
| --- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| AC1 | R1, R7         | Check a matrix containing all 31 signatures with non-uniform vector inputs, in fragments and representative local/imported helpers.                                                                         | Public types, core IR, and editor results agree on concrete result shapes; valid source produces both targets.                                                                                                                                                                                                                     | Public type, core, and TypeScript 7 adapter fixtures.                                                             |
| AC2 | R1, R5, R7     | Try wrong arity, mixed dimensions, scalar/vector `mod`, mixed-shape binary `atan`, unimported names, aliases, and namespace calls.                                                                          | Unsupported signatures receive `SHDR1208` on the whole original call; import/call-boundary failures retain their existing specific diagnostics. No artifact or permissive overload admits the invalid form.                                                                                                                        | Negative public-type/core/editor/CLI fixtures with authored-range assertions.                                     |
| AC3 | R2, R5         | Check `asin`/`acos` at `-1`, `0`, `1`, just outside their domains, and literals that round onto an endpoint; include nested/local and partially known vector inputs.                                        | Endpoints are valid; provably out-of-range f32 lanes report `SHDR1209`, including a bad lane beside an unknown one. No clamping occurs.                                                                                                                                                                                            | Core/domain and original-source editor assertions; valid endpoint target probes.                                  |
| AC4 | R4, R5, R6     | Evaluate positive/negative dividends and divisors, exact multiples, and non-uniform vector/scalar and vector/vector calls; check zero divisors with known and unknown dividends.                            | Ordinary finite results follow the floor-based formula, including the three signed examples above; one zero divisor is diagnosed even beside dynamic lanes. Both generated targets implement the same operation without remainder substitution or repeated argument evaluation.                                                    | Core/type/IR assertions, raw-target probes, numeric and rendered comparisons.                                     |
| AC5 | R3, R9         | Compare native and guarded binary `atan` across the specified quadrants, axes, signed-zero, tiny-input, branch-cut, and exploratory-origin cases.                                                           | A recorded decision identifies supported behavior/domain and its rationale, separates guarantees from observations, and resolves the draft axis contract before final acceptance. User-significant tradeoffs are not silently decided.                                                                                             | Real WebGL/WebGPU numeric probes, visible angle/hue comparison, and decision review.                              |
| AC6 | R2, R3, R6, R9 | Render pinned finite cases exercising unary and binary `atan`, both inverse sine/cosine functions, both conversions, and every result dimension; include asymmetric quadrants and a dynamic-uniform update. | WebGL and presented WebGPU agree with the mathematical expectations and each other within explicit tolerances. Unary `atan` is distinguished from quadrant-aware binary `atan`; conversion tests use known angles as well as round trips. Finalized axis assertions follow AC5.                                                    | Real browser numeric/rendered evidence, multiple non-center samples, documented inputs/environment/tolerances.    |
| AC7 | R5, R6         | Compile directly invalid calls, valid constant calls, and calls through dynamic helper parameters on both targets; include a known non-finite compound argument.                                            | Locally provable violations report `SHDR1209` at the authored call with no artifact. Unknown parameter values remain caller preconditions, without new interprocedural rejection or WGSL-only eager-constant failures. Invalid runtime pixels are not claimed portable.                                                            | Core/domain/editor tests and real target compilation probes.                                                      |
| AC8 | R7, R8         | Use the new builtins through CLI, a static Vite import, browser compilation, and the existing REPL; edit between valid and invalid source and inspect TypeScript 7 hovers.                                  | All paths accept/reject the same forms, update original-source hovers/diagnostics, and preserve the REPL's previous valid frame on source failure. Ordinary `.ts` ownership is unchanged.                                                                                                                                          | Integration and editor-adapter coverage with browser REPL checks.                                                 |
| AC9 | R8, R9         | Compile a shader using new builtins alongside existing guarded math, helpers, custom uniforms, and collision-prone names; build its static consumer and inspect artifacts.                                  | Existing expression grouping, names, metadata/bindings, update behavior, and accepted/rejected old signatures remain intact. The static consumer contains artifact data rather than the compiler or authored shader execution. Documentation matches the accepted new domain/signature boundary and makes no completed-port claim. | Compatibility fixtures, generated-output/artifact assertions, static-bundle inspection, and documentation review. |

## Assumptions

- **Existing diagnostic policy extends to all six names:** known non-finite arguments use `SHDR1209`; domain proofs stay local and conservative. This follows the agreed reuse of existing math policy, but individual overflow thresholds and new exact constant identities were not separately chosen. Validate these against raw-target behavior without treating JS transcendental approximations as target-exact proofs.
- **Standard angle conversions suffice:** no user-specified common conversion constant or bit-exact arithmetic sequence was agreed. Choose emission consistent with the mathematical contract and tolerance evidence; do not add an exact-round-trip requirement.
- **Existing delivery seams are sufficient:** no artifact/runtime API or editor transport migration is needed. Validate the assumption through integration/compatibility coverage; do not expand the public surface if an implementation seam proves inconvenient.
- **Browser evidence may use software GPU implementations:** record the actual environment, as existing suites do. Such results establish those browser paths, not hardware-wide identity or a performance claim.

## Risks and open decisions

- **Resolved contract tradeoff:** native forwarding avoids custom generated branches and matches the visible ordinary output; exact signed-zero-sensitive axes, origin, and very small-input precision are intentionally outside the portable value guarantee. The comparison evidence records the observed edge behavior without promoting it to cross-target identity.
- **Feasibility gate:** WGSL eager constant evaluation and floor-based `mod` expansion may expose target-specific creation failures. Validate before committing to emission details; any conflict with the shared accepted-input policy requires an explicit contract review, not backend divergence.
- **Non-blocking precision risk:** very small divisors, large quotients/products, subnormals, and transcendental variation can defeat naive global range/accuracy assertions. Document evidenced limits and use nondegenerate pinned inputs; do not silently restrict ordinary negative operands or promise all finite inputs yield finite results.
- **Non-blocking evidence risk:** 8-bit rendered pixels alone can hide small angle errors. Pair the visible spike with numeric observations and distinguish tolerances from observed precision. Exact probe mechanics and thresholds belong in the implementation plan.
- **Non-blocking performance risk:** explicit axis handling may enlarge generated shaders or add execution cost. Do not assert a cost or benefit from static code size alone; investigate only if comparison evidence warrants it.

## Deferred work

- The orbiting-circles translation and reference-frame fidelity review, including scalar matrix rewrites or PR 8 and a defined inverse-ramp replacement for reversed `smoothstep`.
- `tan` and its near-pole portability contract; revisit when a concrete consumer needs it.
- General broadcasting, additional mixed-shape overloads or aliases, unrelated builtin extensions, new numeric types/stages, authored branching, matrices, and module captures.
- Interprocedural domain proofs, invalid-input normalization/fallbacks, a multi-file REPL UI, runtime/API changes, and broad cross-hardware performance/bit-identity claims.
