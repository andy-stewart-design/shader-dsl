# Mixed-shape `clamp` / `pow` implementation plan

Status: **Phase 2 complete; browser pixels, documentation and completion gates remain.** The signature boundary below was agreed in discussion and recorded in [follow-up notes](../notes.md#mixed-scalarvector-clamp-and-pow-signatures-after-pr-3). This is a focused extension of the [completed PR 3 contract](../_completed/language-extension-first-three-plan.md), not a general broadcasting feature. Paths below are relative to the repository root. Do not disturb unrelated worktree changes.

## Contract and delivery boundary

Let `S = Expr<F32>` and `V = Expr<VecN<F32>>` for one fixed `N` in `2 | 3 | 4`. Existing `clamp(S, S, S)`, `clamp(V, V, V)`, `pow(S, S)` and `pow(V, V)` stay valid. Add exactly these families for **each** `N`:

| Call                                                           | Result | New cases                             |
| -------------------------------------------------------------- | ------ | ------------------------------------- |
| `clamp(V, low, high)` with each bound independently `S` or `V` | `V`    | `(V, S, S)`, `(V, S, V)`, `(V, V, S)` |
| `pow(V, S)`                                                    | `V`    | `(V, S)`                              |

Reject `clamp(S, V, V)`, `pow(S, V)`, any mixed vector dimensions, wrong arity and non-f32 kinds. Scalar broadcast is **per argument at the call boundary**; do not alter general operator rules, the shared `ternary-same` / `binary-same` treatment of unrelated builtins, or the target-neutral IR to contain implicit backend-specific splat calls. A scalar base can be explicitly written `pow(vecN(base), exponentVector)` using the existing same-shape overload.

Preserve the PR 3 domain contract after f32 rounding: `clamp` requires `low <= high` for each result component (equality is valid); `pow` requires every base to be nonnegative and any zero base to have a positive exponent. Provably non-finite arguments/results remain errors. Diagnose only locally provable violations, including one known-bad lane when other lanes are unknown; dynamic unknowns remain caller preconditions. A helper call such as `root(-1)` is **not** interprocedurally proved. Existing invalid signatures use `SHDR1208`, invalid domains `SHDR1209`, both on original authored calls. Preserve right-nested f32 expression grouping and existing safe-name generation. Do not promise bit-identical GPU pixels.

No new runtime uniform or binding slots, artifact fields, resource types, imported-file semantics, or shader execution. Keep the JSON dual-target artifact, static-consumer compiler exclusion, REPL single-textarea behavior and the current `.shdr.ts` editor ownership. This slice does not depend on resolving texture/sampler questions or migrating the VS Code fixture to LSP. Ship the public overloads, core checking, both backends, editor parity and browser evidence **together**, not as a types-only partial feature.

## Phase 0 — Raw-target feasibility and baseline (stop for review)

- [x] Inspect existing same-shape and rejected mixed-shape fixtures and run focused baseline checks before modifying implementation. Record baseline failures separately from work on this slice; do not claim they were caused by this change.
- [x] Probe **real** GLSL ES 3.00/WebGL 2 and WGSL/WebGPU acceptance of V2/V3/V4 `clamp` with each scalar-bound combination and `pow(V, S)` using nondegenerate values. For output, explicitly expand scalar arguments to the matching vector type wherever the native builtin or Shdr's wrapper requires it; do not assume GLSL's `clamp(V,S,S)` overload covers partially mixed bounds or that WGSL accepts any mixed form.
- [x] Probe a WGSL compile-time constant domain/overflow case: Shdr's `shdr_internal_safe_{clamp,pow}_vecN` parameter helpers must continue to prevent shader-creation failures for inputs Shdr cannot prove invalid. Stop and adjust the plan if the helper strategy or scalar splat changes shader-creation behavior.

**Phase 0 results (2026-10-12):**

- Baseline had no failures. `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/pr3-target-feasibility.test.ts test/math-builtin-target-feasibility.test.ts test/math-builtin-ir.test.ts test/math-builtin-parity.test.ts` passed 64/64 tests. `pnpm --filter @shdr/core check` and `pnpm --filter shdr check` also passed.
- Added `packages/core/test/mixed-shape-clamp-pow-target-feasibility.test.ts`; its two browser probes pass. Under Chromium headless with WebGL 2 and WebGPU enabled using SwiftShader (`--enable-unsafe-swiftshader`, `--enable-unsafe-webgpu`, `--use-angle=swiftshader`), all V2/V3/V4 same-shape calls compile. GLSL ES accepts raw `clamp(V,S,S)` but rejects `clamp(V,S,V)`, `clamp(V,V,S)`, and `pow(V,S)`. WGSL rejects all raw mixed forms, including `clamp(V,S,S)`. Explicit `vecN` / `vecN<f32>` scalar expansion compiles for every new family on both targets.
- Direct WGSL constant `clamp` calls with reversed bounds and `pow` calls with a provable overflowing vector result fail shader creation for V2/V3/V4. The corresponding parameterized `shdr_internal_safe_clamp_vecN` and `shdr_internal_safe_pow_vecN` helpers compile successfully, confirming the existing guard strategy remains viable. `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/mixed-shape-clamp-pow-target-feasibility.test.ts` passed 2/2, and the test TypeScript check passed.

**Gate:** target spelling is explicit vector expansion for every scalar argument in the new vector calls; same-shape calls remain unchanged. No issue changes the agreed signatures. Raw target acceptance and WGSL helper behavior are covered by the browser-backed probe, not source-string assertions alone. Existing probes in `packages/core/test/pr3-target-feasibility.test.ts` and the PR 3 generated math suites remain useful starting points.

## Phase 1 — Public types, target-neutral semantics and diagnostics

- [x] Extend `packages/shdr/src/math.ts` with explicit V2/V3/V4 overloads for the four new cases per size; retain the scalar and same-shape overloads. Add accepted/rejected compile-time cases in `packages/shdr/test/pr3-types.ts` or a focused new types test. Do not introduce a general `Expr<ShaderType>` catch-all overload that hides invalid combinations.
- [x] Give `clamp` and `pow` dedicated signature rules in `packages/core/src/shader-builtin.ts` (or equivalent narrowly scoped checking), with result shape determined by the **first** argument. Keep `min`, `max`, `smoothstep` and other builtins unchanged. Preserve call IR argument shapes and source ranges in `packages/core/src/lower-shader-syntax.ts`.
- [x] Update `packages/core/src/evaluate-shader-constant.ts` and the domain checks in `lower-shader-syntax.ts` to read a scalar argument's one known f32 component for **each** vector lane. Do not manufacture a known value from `undefined`, mask a known-bad lane with an unknown lane, or use JS double-precision comparisons where the existing contract specifies f32-rounded operands. Cover nested/local constant cases and conservative overflow behavior without approximating uncertain `pow` values.
- [x] Add matrix-style core tests for every accepted family at V2/V3/V4; reject wrong vector sizes, reversed `pow` shapes and scalar-first `clamp` with `SHDR1208` on the full authored call. Verify `SHDR1209` and authored ranges for a reversed scalar bound against one vector lane, a negative/zero base with a scalar exponent, f32-rounded boundary cases and provably overflowing power. Include a partially known vector and an unknown dynamic input that must **not** be rejected. Preserve existing same-shape tests.

**Phase 1 results (2026-10-12):**

- Added explicit public overloads and compile-time acceptance/rejection coverage in `packages/shdr/src/math.ts` and `packages/shdr/test/pr3-types.ts`.
- Added dedicated `clamp` / `pow` signature rules without changing unrelated builtin rules. The target-neutral IR retains scalar argument shapes, first-argument result types, authored call ranges, and authored argument ranges.
- Scalar known components now broadcast only during `clamp` / `pow` constant evaluation and domain checking. f32-rounded equality, known reversed bounds, negative/zero bases, scalar exponent overflow, partially known vectors, dynamic inputs, and local scalar constants are covered in `packages/core/test/mixed-shape-clamp-pow.test.ts`. The old PR 3 mixed-signature rejection cases were updated to reflect the agreed contract.
- `pnpm --filter @shdr/core test -- --runInBand` passed 422/422 tests; `pnpm --filter shdr test` passed 7/7. Core and public-package type checks and Prettier checks passed.

**Gate:** public types, target-neutral IR/result types, exact source-located diagnostics, and conservative domain behavior agree. No generated-code, editor, CLI, or browser acceptance is claimed yet; Phase 2 remains required.

## Phase 2 — Both generators and TypeScript 7 editor

- [x] In `packages/core/src/generate-glsl-expression.ts` and `generate-wgsl-expression.ts`, emit vector splats for scalar `clamp` bounds and `pow` exponent as needed to call a same-shape builtin. In WGSL, splat **before** invoking the existing same-shape `shdr_internal_safe_clamp_vecN` / `shdr_internal_safe_pow_vecN` helpers; retain their parameterized calls for constant-domain protection. Preserve correct grouping and one evaluation of each emitted argument. Keep scalar/same-shape output unchanged unless a justified correction is covered by tests.
- [x] Test both generated sources and real target shader/module compilation for all new shapes, including nested helper calls and WGSL constant-domain guards; verify no generated name collision or helper emitted more than once per signature.
- [x] Exercise TypeScript 7 virtual-source QuickInfo and diagnostics in `packages/language-service/test/` for the new overloads in a fragment **and** a local/imported `defineShaderFunction` helper. Assert authored-file/range errors without virtual helper cascades, and refresh on unsaved edits. Add CLI check cases and a Vite static-import fixture so those paths use the same core semantics; keep ordinary `.ts` ownership. The REPL should compile an in-text example without fetching files.

**Phase 2 results (2026-10-12):**

- GLSL now expands scalar vector-call arguments as `vecN(...)`; WGSL expands them as `vecN<f32>(...)` before the parameterized safe helpers. Existing scalar and same-shape expressions remain unchanged. `packages/core/test/mixed-shape-clamp-pow-generated.test.ts` verifies all V2/V3/V4 families, nested helper generation, one helper declaration per signature, and real WebGL 2/WebGPU compilation.
- Added TypeScript 7 editor coverage in `packages/language-service/test/mixed-shape-editor.test.ts` for fragment QuickInfo, unsaved refresh, local/imported `defineShaderFunction` helpers, authored diagnostics/ranges, and domain parity. The CLI, Vite static-import fixture (`apps/vite-basic/src/mixed-shape-math.shdr.ts`), and REPL in-text textarea path are covered and passed.
- Validation passed: core 423/423 tests, language service 92/92, CLI 24/24; Vite check/build and REPL check/build passed; the REPL browser verification passed with WebGL/WebGPU validation. Browser runs used Chromium headless with SwiftShader/WebGPU enabled.

**Gate:** compiler, public types, CLI, Vite, editor adapter, and existing TypeScript 7 diagnostic/hover paths agree. Phase 3 still must provide rendered WebGL/presented-WebGPU pixel evidence, documentation, and full workspace completion checks. The real VS Code fixture and transport migration remain non-blocking.

## Phase 3 — Browser pixels, documentation and completion

- [ ] Add a deterministic shader fixture testing scalar-bound broadcast in **each** `clamp` position, `pow` with a scalar exponent, all V2/V3/V4 outputs, and a non-uniform vector so a missing or swapped splat is observable. Compare tolerant finite pixels from real WebGL and **presented** WebGPU, including at least one non-center pixel. Check both creation and an update path when a dynamic uniform supplies an argument; do not treat WGSL module compilation or generated text as rendered-pixel evidence. Extend `packages/runtime/test/verify-pr3-math.mjs` or add a focused sibling and wire it into package tests. Maintain original-GLSL comparisons only where there is a defined, pinned original; they are not required for a novel signature.
- [ ] Update the [accepted language reference](../../README.md#accepted-shader-language), `packages/shdr/README.md` where needed, and [follow-up notes](../notes.md#mixed-scalarvector-clamp-and-pow-signatures-after-pr-3) to distinguish **delivered** signatures from remaining candidates. Confirm the build of a runtime-only Vite consumer still excludes core/compiler code and the dual-target artifact/bindings are unchanged.
- [ ] Run focused type/core/editor/CLI/target/browser suites and the workspace `pnpm build`, `pnpm check`, `pnpm test`, `pnpm ci:check`, Prettier check and `git diff --check`. Record exact commands, environment (including real GPU availability) and failures in this plan; label any unavailable real browser/editor gate **Blocked**, not Verified. Final review checks every new signature and every excluded shape against both the public type surface and core.

**Completion gate:** all agreed new calls and negative cases pass type/core/editor/CLI checks; raw target and real WebGL/presented-WebGPU results pass; the accepted language reference matches shipped behavior; no regression in old math signatures, JSON artifact, uniform bindings, or static bundle isolation. Stop for review before treating the feature as complete or merging.
