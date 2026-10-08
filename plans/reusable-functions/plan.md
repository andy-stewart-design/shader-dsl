# Reusable shader functions implementation plan

## Status and governing source

- Governing spec: [spec-2.md](spec-2.md) (not the earlier [draft](spec.md)).
- Delivery state: **Planning only**. All steps are Pending; no verification has been run for this plan.
- Acceptance or release still pending: all AC1–AC9, real GLSL ES 3.00/WebGL 2 and **presented WebGPU** acceptance, and one feature-complete review/PR. Writing this plan does not authorize a PR or merge.
- Blockers: none known. Phase 0 must establish a common project/alias-resolution contract before cross-file implementation. If CLI/Vite/editor cannot honor it, stop and resolve that conflict against the governing spec; do not silently substitute a Vite-only alias.

Step statuses below are the authoritative execution record. A phase is complete only when its step gates **and** exit gate pass. Do not record a build or mocked check as real browser/editor acceptance.

## Execution constraints

- Paths are relative to repository root. Preserve existing unrelated work, including any in-progress moves under `plans/`; expected files are scope estimates, not permission to edit unrelated files.
- Current inspection only (no executed baseline): `packages/core/src/compile-fragment-artifact.ts` and `parse-shader-file.ts` accept a single fragment source; `packages/vite/src/index.ts` replaces a `.shdr.ts` module with a default artifact; `packages/cli/src/check.ts` checks discovered sources individually; TypeScript 7 currently maps a single callback's shader expressions. The REPL has one textarea. All compiler/tool changes need paired test and compatibility coverage.
- Core and the opt-in browser compiler must remain environment-neutral: **never evaluate authored imports, invoke helper/`defineUniforms` callbacks, read disk implicitly, or add Node/project dependencies to browser core**. Only hosts load files. Maintain fragment-only inputs, target-neutral f32 grouping, unchanged artifact schema/bindings and source diagnostic positions for existing shaders.
- No phase can claim a new authored form fully supported while any required target or diagnostic route is missing. Where adjacent steps jointly introduce a public form, treat them as an atomic merge/revert group and keep the current supported shaders usable at intermediate review points.
- Commands below assume workspace dependencies already installed. Targeted `test/reusable-*.test.ts` files and new browser fixtures are **proposed additions**, not currently runnable. Real GPU checks require a working Playwright Chromium/WebGPU adapter; real editor acceptance requires the VS Code executable used by `apps/editor-fixture/run-editor-test.mjs` (or `VSCODE_EXECUTABLE_PATH`). Record environment failures as Blocked, not Verified.

## Phase overview and delivery boundary

| Phase | Outcome                                                                                       | Dependencies   | Exit gate                                                                                |
| ----- | --------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| 0     | Baseline and project-resolution/diagnostic decision lock                                      | Governing spec | Written contracts and identified seams; no production change                             |
| 1     | Same-file typed functions compile to both targets and work in the TypeScript 7 editor         | Phase 0        | Local helper + builtin-domain/invalid-shape cases pass in core and editor                |
| 2     | Core virtual module graph, imported uniforms, and project-backed CLI paths                    | Phase 1        | Cross-file artifacts/diagnostics and CLI graph cases agree; old single-source API intact |
| 3     | Vite static/development, project editor/LSP, and single-textarea REPL compose with that graph | Phase 2        | Consumer-specific positive/negative and invalidation checks pass                         |
| 4     | Real GPU/browser parity, shared-uniform isolation, documentation, and final acceptance        | Phase 3        | All AC1–AC9 gates plus full regression review                                            |

Delivery boundary: **one feature-complete PR after Phase 4**; these phases are reviewable increments, not permission to merge partial public behavior. Atomic groups: Steps 1.1–1.2 for local helper compiler/editor parity, and Steps 2.1–3.2 for publicly reusable cross-file imports across core, CLI, Vite and editor. Do not land or revert only one member of an atomic group with consumers depending on it.

## Phase 0 — Contract and feasibility baseline

Outcome: select a testable, consistent multi-host resolution contract without changing app behavior.
Depends on: governing spec.
Review boundary: only existing source/test inspection and an execution note in this plan; do not build a resolver or run GPU/editor suites here.

### Step 0.1 — Lock paths, module shape, and attribution seam

Status: Pending
Requirements / acceptance: R3, R5–R7, R9; informs AC2, AC4, AC5.
Depends on: None.
Review boundary: specification/feasibility only; no production change.

Expected files:

- `plans/reusable-functions/plan.md` — record the confirmed resolution/diagnostic decision and any required spec clarification (without silently weakening `spec-2.md`).
- `packages/core/src/parse-shader-file.ts`, `packages/core/src/diagnostics.ts`, `packages/lsp/src/project-discovery.ts`, `packages/language-service/src/typescript-7-editor-adapter.ts`, `packages/vite/src/index.ts`, `packages/cli/src/check.ts` — inspect only.

Tasks:

- [ ] Trace the currently supported `shdr` import and same-file `defineUniforms` forms, public diagnostic shapes, and single-source core/browser API; record compatibility constraints.
- [ ] Determine a shared rule for selected `tsconfig.json`, `paths`/relative imports, missing configs, canonical paths, duplicate imports and dependency cycles; identify how CLI, Vite and editor will supply files to core without using Vite-only resolution.
- [ ] Inspect virtual-source project/hover mapping and Vite transformation/watch behavior for helper-only and mixed-export modules; note what needs atomic change.
- [ ] Choose a representative three-file helper + imported-uniform fixture and a minimal invalid-cycle/missing-import case; confirm the assumed direct-export and one-schema syntax against the spec examples.

Verification:

- Automated: Not applicable; this is a read-only feasibility/decision gate, not behavior proof.
- Manual: Compare the recorded rules with the actual entry/config semantics in the cited files; ensure the same alias maps to the same file for each proposed host and a browser virtual map. Record any counterexample and stop the affected work until resolved.

Completion gate: project/alias resolution, file-identity/diagnostic attribution, and module-cycle rules are documented with no unaddressed conflict with R5. Evidence: Not run.

Phase exit gate: review the decision record before code changes; if the governing contract is infeasible, update it only after resolving that material conflict rather than implementing an alternative quietly. Evidence: Not run.

## Phase 1 — Same-file typed helpers

Outcome: a local helper can be authored once, called inside a fragment, and emitted as a typed function in GLSL/WGSL; TypeScript 7 preserves source hovers/diagnostics.
Depends on: Phase 0.
Review boundary: local helpers only; cross-file resolution and imported uniforms remain unsupported until Phase 2. Steps 1.1–1.2 form an atomic user-visible acceptance gate.

### Step 1.1 — Typed local helper through parsing, IR, and both emitters

Status: Pending
Requirements / acceptance: R1–R2, R8, R11–R12; AC1, AC9 (core portion).
Depends on: Step 0.1.
Review boundary: local `defineShaderFunction` syntax and semantics; no module graph or editor claims.

Expected files:

- `packages/shdr/src/dsl.ts`, `packages/shdr/src/types.ts`, `packages/shdr/src/index.ts`, `packages/shdr/test/` — source marker/signature and type-level cases.
- `packages/core/src/parse-shader-file.ts`, `validate-shader-syntax.ts`, `normalize-shader-syntax.ts`, `shader-syntax.ts`, `lower-shader-syntax.ts`, `shader-ir.ts`, `diagnostics.ts` — local function parsing, typed parameters/return, call resolution and source diagnostics.
- `packages/core/src/generate-glsl-expression.ts`, `generate-glsl-fragment.ts`, `generate-wgsl-expression.ts`, `generate-wgsl-fragment.ts`, `shader-local-name.ts`, `compile-fragment-artifact.ts`, `packages/core/test/reusable-local.test.ts` (new) — callable emission/name isolation and focused tests.

Tasks:

- [ ] Recognize top-level `const` helpers with typed `Expr` parameters, supported `import type` from `shdr`, optional return annotations, expression/block bodies, and a marker that does not execute authored functions. Keep ordinary JS callables out of shader lowering.
- [ ] Lower parameter/local references and calls to target-neutral types with inferred/checked returns, no captures, exact shape/arity checks, collision-safe names and direct/indirect local recursion rejection.
- [ ] Emit each reachable local helper in both targets with correct signatures, grouping and builtin/splat support; preserve existing artifact fields and single-source fragments.
- [ ] Add focused success/failure tests for scalar/V2/V3/V4, annotation inference/mismatch, capture, invalid calls, nested helper calls, and locally provable builtin-domain errors versus `root(-1)` precondition behavior. Include real WebGL shader compilation and WGSL module compilation for a representative local helper, not only string snapshots.

Verification:

- Automated: add `packages/core/test/reusable-local.test.ts`, then run `pnpm --dir packages/core exec vitest run --config ../../vitest.config.ts --root . test/reusable-local.test.ts`, `pnpm --filter shdr test`, and `pnpm --filter @shdr/core check` (repo root). Check valid GLSL/WGSL compilation and exact invalid-source ranges; no new errors for existing single-source cases.
- Manual: Not needed; core, type and actual target-compilation tests cover this step's limited scope.

Completion gate: local helper source yields a valid dual-target artifact and both real target compilers accept it; invalid calls/captures/domain cases fail at authored ranges, and existing no-helper compilation still works. **Not a merge gate until Step 1.2 passes.** Evidence: Not run.

### Step 1.2 — Local-helper editor transformation and typed hovers

Status: Pending
Requirements / acceptance: R1–R2, R7, R9, R12; AC1 (editor portion).
Depends on: Step 1.1.
Review boundary: same-file TypeScript 7 virtual transformations/diagnostic routing; no cross-file edits.

Expected files:

- `packages/core/src/create-virtual-source.ts`, `transform-shader-expressions.ts`, `analyze-fragment.ts` — map every helper body's shader expressions alongside fragment expressions.
- `packages/language-service/src/typescript-7-editor-adapter.ts`, `diagnostic-routing.ts`, `packages/language-service/test/reusable-local-editor.test.ts` (new) — typed QuickInfo and routed ranges.
- `apps/editor-fixture/` (if needed for real UI later) — valid local-helper authoring fixture.

Tasks:

- [ ] Rewrite helper expressions in the TypeScript 7 virtual document without executing them or mapping a generated operation to an unrelated original range; preserve existing callback mapping.
- [ ] Route missing annotations, capture, wrong-arity/shape, return-type and builtin-domain diagnostics to original helper/call spans; check typed hovers at definition/usage.
- [ ] Add adapter tests for valid helpers and negative edits, including ordinary `.ts` delegation and existing shader hover/diagnostic regressions.

Verification:

- Automated: add `packages/language-service/test/reusable-local-editor.test.ts`, then run `pnpm --filter @shdr/language-service test` and `pnpm --filter @shdr/core test` (root). Assert hovers/diagnostic ownership and unchanged no-helper behavior.
- Manual: Not needed for this local adapter increment; real VS Code UI is required at Step 3.2/final acceptance.

Completion gate: the TypeScript 7 adapter and core agree on local-helper calls/types/errors with original positions, and existing fragment/ordinary-TS tests stay green. Evidence: Not run.

Phase exit gate: run `pnpm build` and `pnpm exec turbo run check --force` after both steps; the local helper works in both targets and the TypeScript 7 adapter, while old shaders remain accepted. No cross-file or REPL claims yet. Evidence: Not run.

## Phase 2 — Virtual source graph and project-backed checks

Outcome: a browser-supplied virtual graph or project-backed CLI can compile a fragment with imported helpers/uniform schema, diagnose source-file faults and preserve the old single-source API.
Depends on: Phase 1.
Review boundary: core + CLI; no Vite/editor cross-file completion claim until Phase 3.

### Step 2.1 — Environment-neutral named imports and graph compilation

Status: Pending
Requirements / acceptance: R3, R5–R8, R12; AC2, AC4 (core virtual-graph portion).
Depends on: Phase 1 exit.
Review boundary: relative `.shdr.ts` helpers, import aliases and transitive graph in core; custom schemas and project aliases follow.

Expected files:

- `packages/core/src/parse-shader-file.ts`, `shader-syntax.ts`, `shader-ir.ts`, `lower-fragment.ts`, `lower-shader-syntax.ts`, `compile-fragment-artifact.ts`, `diagnostics.ts`, `browser.ts`, `index.ts` — module exports/imports, file-aware diagnostics and virtual input contract.
- `packages/core/src/` (new graph resolver, if needed), `packages/core/test/reusable-graph.test.ts` (new) — pure path/graph logic and tests.

Tasks:

- [ ] Accept helper-only and mixed-export `.shdr.ts` sources; bind direct named imports to stable definitions even with aliases/colliding spellings; follow transitive dependencies without evaluating modules.
- [ ] Define a virtual entry/files API with normalized file identities and relative resolution; report missing exports/files, malformed imports and module/function cycles with a useful path; keep single-string no-import usage unchanged.
- [ ] Carry original file identity plus ranges through graph failures, while preserving legacy single-source diagnostic shapes where possible. Reject partial artifacts and deduplicate repeated helper emission.
- [ ] Test an imported helper from a mixed module, a three-file chain, helper-only modules, alias/cycle/missing-import failures, frozen/deterministic results and default-shader reachability. Check GLSL/WGSL output for reachable helpers, not merely parse success.

Verification:

- Automated: add `packages/core/test/reusable-graph.test.ts`, then run `pnpm --dir packages/core exec vitest run --config ../../vitest.config.ts --root . test/reusable-graph.test.ts` and `pnpm --filter @shdr/core check`. Assertions include browser-safe graph compilation with no Node dependency, file/range fault ownership and unchanged single-source artifacts.
- Manual: Not needed; input map and emitted text are fully observable in focused core tests. Real project resolver and GPU acceptance occur later.

Completion gate: a three-file virtual map produces both target shaders and precise graph diagnostics without filesystem/JS execution; old single-source inputs still compile. **Cross-file public feature not mergeable until Steps 2.2–3.2.** Evidence: Not run.

### Step 2.2 — Imported uniform schema without artifact changes

Status: Pending
Requirements / acceptance: R4, R7–R8, R12; AC3 (compile/type portion).
Depends on: Step 2.1.
Review boundary: named `defineUniforms` import and one explicitly linked schema; no runtime/backend resource changes.

Expected files:

- `packages/core/src/parse-shader-file.ts`, `parse-custom-uniforms.ts`, `lower-fragment.ts`, `shader-ir.ts`, `compile-fragment-artifact.ts`, `packages/core/test/reusable-uniforms.test.ts` (new) — schema resolution/metadata and negative cases.
- `packages/shdr/src/dsl.ts`, `packages/shdr/test/` — check source/host schema typing for an imported definition if declaration types need adjustment.

Tasks:

- [ ] Resolve the selected `{ uniforms }` declaration by named import or existing same-file declaration, without evaluating builder callbacks; retain complete literal defaults and referenced subset.
- [ ] Verify two independent fragments can import one schema, and a helper can only use its fields when explicitly passed arguments.
- [ ] Reject missing, invalid, mismatched or multiply selected definitions at their authored locations while preserving the inline/chained and local named forms.
- [ ] Compare JSON metadata and output bindings to equivalent same-file input; do not add fields or inferred runtime bindings.

Verification:

- Automated: add `packages/core/test/reusable-uniforms.test.ts`; run `pnpm --dir packages/core exec vitest run --config ../../vitest.config.ts --root . test/reusable-uniforms.test.ts test/custom-uniforms.test.ts`, `pnpm --filter shdr test`, and `pnpm --filter @shdr/core check`. Expect identical schema/defaults and no helper capture; runtime independence gets a real check in Step 4.1.
- Manual: Not needed; this step changes compile-time linkage and metadata only.

Completion gate: virtual imports select the same custom schema/metadata as a local definition; malformed links yield original-file diagnostics and all existing custom-uniform fixtures still pass. Evidence: Not run.

### Step 2.3 — Shared TypeScript-project paths and CLI graph checking

Status: Pending
Requirements / acceptance: R5, R7, R9, R12; AC4, AC5 (CLI portion).
Depends on: Steps 2.1–2.2 and Phase 0 resolution rule.
Review boundary: project-backed resolution and CLI check presentation; Vite/editor must reuse the resulting effective graph contract, not invent new alias semantics.

Expected files:

- `packages/cli/src/check.ts`, `discover.ts`, `package.json` (only if config parsing requires a runtime dependency), `packages/cli/test/cli.test.ts` (or new `reusable-graph.test.ts`) — project/relative resolution and one diagnostic per authored fault.
- `packages/core/src/` (graph-input/path normalization contract, if needed) — only environment-neutral changes.
- `packages/lsp/src/project-discovery.ts` and project fixtures — inspect/reuse project-selection rules; change only if shared behavior requires it.

Tasks:

- [ ] Load a selected project's `tsconfig.json` `paths` (including relevant config inheritance), resolve relative/aliased `.shdr.ts` sources with deterministic file identities, and give explicit errors for unsupported/no-config alias use.
- [ ] Check helper-only entries, discovered fragments and their allowed dependencies; report a shared-file error once per check rather than multiplying it by dependents.
- [ ] Use isolated temporary TS projects to test aliases, missing/out-of-project files, cyclic graphs and diagnostics at the actual owner file/line, without modifying workspace fixtures during the run.
- [ ] Keep existing CLI discovery, single-file checks and ordinary TypeScript responsibility unchanged.

Verification:

- Automated: add CLI temp-project cases, then run `pnpm --filter @shdr/cli test` and `pnpm --filter @shdr/cli check` (root). Expect distinct successful relative/alias cases and deterministic negative output with no duplicated shared-file fault.
- Manual: Not needed; CLI invocation and file/line output are covered by process-level tests. Final workspace `pnpm shdr check` is gated by Phase 4.

Completion gate: CLI and virtual-map compilation agree on an equivalent graph, helper-only files check without dummy fragments, and no Node filesystem code enters browser core. Evidence: Not run.

Phase exit gate: `pnpm build`, focused core/CLI suites and uncached checks succeed; a project fixture and equivalent virtual map produce the same artifact and file-aware errors. Do not claim Vite/editor alias parity until Phase 3. Evidence: Not run.

## Phase 3 — Consumer integration and project editing

Outcome: static builds and development invalidation, editor project diagnostics/hovers, and current REPL behavior honor the new contract.
Depends on: Phase 2.
Review boundary: no new language shapes or runtime API; fix consumer integration without altering core's browser-safe graph semantics.

### Step 3.1 — Vite source-graph transform and static boundary

Status: Pending
Requirements / acceptance: R5, R8–R9, R12; AC4, AC5 (Vite portions), AC7.
Depends on: Phase 2 exit.
Review boundary: host file loading, dependency watching, artifact output and negative named-runtime imports.

Expected files:

- `packages/vite/src/index.ts`, `packages/vite/test/index.test.ts` — graph-aware transform and error locations.
- `apps/vite-basic/src/` (new shared `.shdr.ts` and importing entry fixtures), `apps/vite-basic/verify-build.mjs`, `verify-dev.mjs` — static bundle and invalidation checks with isolated/edit-restoring source handling.

Tasks:

- [ ] Resolve fragments through the same effective project/alias rule as CLI, load reachable `.shdr.ts` sources before transformation and register them as Vite dependencies; keep the default runtime export as JSON artifact data.
- [ ] Handle helper-only modules as compile-time sources and reject ordinary host named imports of helpers/uniform declarations rather than shipping source or a fake callable export.
- [ ] Check a valid imported helper/schema, invalid import attribution, shared-helper edits propagating to two dependent fragments, and schema-default edits changing both artifacts; test restoring/isolating edited source on failure.
- [ ] Inspect both production dual-backend and WebGL-only bundles for compiler/DSL/authored-source leakage while retaining existing artifact type usability.

Verification:

- Automated: extend `packages/vite/test/index.test.ts`, `apps/vite-basic/verify-dev.mjs` and `verify-build.mjs`; run `pnpm --filter @shdr/vite test`, `pnpm --dir apps/vite-basic build`, and `pnpm --dir apps/vite-basic test:dev` after dependency builds. Unit tests prove transform behavior; Vite dev checks prove real dependent invalidation; production checks prove static bundle exclusion. A proposed negative fixture asserts named runtime imports fail clearly.
- Manual: Not needed if the dev-server tests perform actual dependency edits/reloads and the build checks inspect the emitted graph.

Completion gate: both entries update after a shared edit, malformed imports report the correct authored file, the production bundle contains only artifacts/renderer code, and host named helper imports do not execute. Evidence: Not run.

### Step 3.2 — Project-aware editor and LSP diagnostics

Status: Pending
Requirements / acceptance: R5, R7, R9, R12; AC4, AC5 (editor portions).
Depends on: Phase 2 exit and completed Step 3.1 (shared graph/alias contract).
Review boundary: virtual project snapshots, cross-file QuickInfo/ranges and invalidation; ordinary `.ts` remains delegated.

Expected files:

- `packages/language-service/src/typescript-7-editor-adapter.ts`, `typescript-7-checker.ts`, `diagnostic-routing.ts`, `packages/language-service/test/reusable-project-editor.test.ts` (new) — cross-file mapping/refresh.
- `packages/lsp/src/project-discovery.ts`, `server.ts`, `packages/lsp/test/` — project-aware source lookup and protocol tests if needed.
- `apps/editor-fixture/` (new project helper/fragment fixtures), `apps/editor-fixture/src/extension.test.ts`, `apps/editor-fixture/test.mjs` — real editor coverage.

Tasks:

- [ ] Transform/recheck helper-body operations in their defining file as well as fragments, and map imported call/type errors to callers without attributing a dependency fault to every consumer.
- [ ] Use the same selected TS project's resolution as CLI/Vite, including `paths`, while maintaining consistent open-file unsaved edits, project-version invalidation and hovers after dependency updates.
- [ ] Add valid and negative multi-file project fixtures and LSP/editor tests for definition/call hovers, original ranges, aliases, helper-only files, and unchanged ordinary `.ts` ownership.
- [ ] Extend the real VS Code UI test itself to open helper and fragment fixtures, edit a dependency and check refreshed owning-file diagnostics/hovers; retain its existing diagnostic/hover cases.

Verification:

- Automated: add `packages/language-service/test/reusable-project-editor.test.ts` and applicable LSP/fixture tests, then run `pnpm --filter @shdr/language-service test`, `pnpm --filter @shdr/lsp test`, and `pnpm --dir apps/editor-fixture test` (root). Assert original-file/line routing, QuickInfo, stale-result handling and delegation.
- Manual/live: after `pnpm --dir apps/editor-fixture build`, run `pnpm --dir apps/editor-fixture test:editor` with VS Code installed (or `VSCODE_EXECUTABLE_PATH`); open imported helper and fragment, change a helper, observe updated hover/diagnostic in the owning file and no ordinary `.ts` takeover. Record executable/version and observed result; if VS Code is unavailable, mark this live gate Blocked.

Completion gate: adapter/LSP checks and **real VS Code UI** demonstrate cross-file edit/hover/diagnostic ownership; no test-only virtual result is presented as editor acceptance. Evidence: Not run.

### Step 3.3 — Preserve single-textarea REPL behavior

Status: Pending
Requirements / acceptance: R6, R10–R12; AC8.
Depends on: Phase 1 local helpers and Phase 2 single-string failure contract.
Review boundary: no new tabs/file-picker or automatic fetch; browser compilation/preview behavior only.

Expected files:

- `apps/repl/src/App.tsx` (only if needed), `apps/repl/verify-browser.mjs` — same-file helper and missing-external-file cases.
- `apps/repl/README.md` — document local helper support and explicit virtual-map limit.

Tasks:

- [ ] Compile/render a shader with a local helper from the current textarea; verify both generated target panels and both previews when WebGPU is available.
- [ ] Compile a source importing an external helper without a map; show a clear unresolved-import diagnostic, avoid network loads, preserve the last installed shader/pixels and keep errors shared across backends.
- [ ] Preserve custom-uniform controls, compiler opt-in entry and single-source fallback behavior.

Verification:

- Automated: extend `apps/repl/verify-browser.mjs`, then run `pnpm --dir apps/repl test` after `pnpm build` has provided workspace dist. Assert both rendered paths for valid local helper and no partial replacement/fetch on missing import.
- Manual: Not needed for this step if the browser UI test exercises source edits, diagnostics and installed pixels; document WebGPU-unavailable fallback separately in existing tests.

Completion gate: same-textarea helpers render successfully and missing imported files block both previews without changing the last good image. Evidence: Not run.

Phase exit gate: focused Vite, language-service/LSP, editor UI, and REPL gates all pass on the shared project/virtual graph; `pnpm build` keeps static host bundles compiler-free. Evidence: Not run.

## Phase 4 — Cross-backend and regression acceptance

Outcome: non-degenerate rendered proof for imported helpers/uniforms and no regressions in public/static consumers.
Depends on: Phase 3.
Review boundary: composed behavior, user docs and final audit; do not broaden language syntax to make reference ports pass.

### Step 4.1 — Pinned two-target pixels and independent schema usage

Status: Pending
Requirements / acceptance: R3–R4, R8, R11–R12; AC3 (renderer portion), AC6.
Depends on: Phase 3 exit.
Review boundary: browser integration fixture and reference expectations, not new runtime/binding APIs.

Expected files:

- `apps/vite-basic/src/` (new reused grain/palette-style and imported-uniform fixture, if not already added in Step 3.1), `apps/vite-basic/verify-render.mjs` — static Vite artifact/browser rendering.
- `packages/runtime/test/` (new `verify-reusable-functions.mjs` if needed), `packages/runtime/package.json` only if wiring a new test command — independent renderer state.
- `packages/core/test/` — focused output/binding regression if a browser failure exposes a missing case.

Tasks:

- [ ] Pin resolution, canonical top-left coordinates, mouse, time and custom defaults/overrides; choose finite, non-degenerate sample points and channel tolerances before comparing outputs.
- [ ] Compile/link/run the imported-helper GLSL in real WebGL 2; compile/pipeline/draw the WGSL and sample **presented** WebGPU canvas pixels (not only an offscreen buffer or compilation messages).
- [ ] Compare expected sample colors and backend parity within tolerances; assert reachability/emitted-once, correct uniform metadata/grouping, and no bit-identity claim.
- [ ] Install two artifacts sharing an imported uniform definition into separate renderer instances; update/reset one and check the other's first/current pixels and defaults are unaffected.

Verification:

- Automated: extend `apps/vite-basic/verify-render.mjs` or add the runtime browser test and wire it into `@shdr/runtime`'s script; run `pnpm --dir apps/vite-basic test:render` and `pnpm --filter @shdr/runtime test` after build. Assert real target compilation and WebGL readback versus presented WebGPU pixels for pinned inputs, plus isolated updates.
- Manual: Not needed when Playwright Chromium WebGL 2 and WebGPU are available and the automated test samples the presented canvas. If unavailable, record a Blocked gate rather than accepting module compilation as pixel evidence.

Completion gate: both real targets render the imported helper/default shader at the agreed samples, runtime schema isolation holds and existing WebGL/presented-WebGPU suites pass. Evidence: Not run.

### Step 4.2 — Documentation and complete regression/PR gate

Status: Pending
Requirements / acceptance: R1–R12; AC1–AC9 (aggregate, not replacement for earlier focused gates).
Depends on: Step 4.1.
Review boundary: user-facing examples, unchanged behavior and final diff; no new feature paths.

Expected files:

- `README.md`, `packages/shdr/README.md`, `packages/cli/README.md`, `apps/repl/README.md`, `apps/vite-basic/README.md` (only where examples/contracts change) — authoring/import/domain limits.
- `plans/reusable-functions/plan.md` — execution evidence and any accepted deviations.
- Existing tests/fixtures only where final integration uncovers a regression.

Tasks:

- [ ] Document explicit helper parameters, typed inputs/inferred returns, imported schemas, relative and `tsconfig` aliases, compile-only named exports, no REPL multi-file UI, and the `root(-1)` caller-precondition limitation.
- [ ] Audit exported public types and source/bundle graph for any legacy single-file assumption; keep older no-helper fixtures and original diagnostic ownership intact before removing any compatibility path.
- [ ] Run full workspace build, uncached checks, CLI check, all test suites, real editor UI, formatter and whitespace audit; record revision/environment, failures and evidence in owning gates. Do not mark a waived/blocked GPU or editor check Verified.
- [ ] Review final diff for runtime/IR/binding drift, helper namespace collisions, unnecessary output/golden churn, compiled/authored source leaks and untouched unrelated work; seek review before any push/PR/merge.

Verification:

- Automated (repo root): `pnpm build`, `pnpm exec turbo run check --force`, `pnpm shdr check`, `pnpm test`, `pnpm exec prettier --check README.md packages/shdr/README.md packages/cli/README.md apps/repl/README.md apps/vite-basic/README.md plans/reusable-functions/plan.md` (also check every other changed source/test file), and `git diff --check`. `pnpm test` includes project browser tests but **not** `test:editor`; use Step 3.2's real UI gate separately.
- Manual/live: run `pnpm --dir apps/editor-fixture test:editor` after build with working VS Code; review AC1–AC9 evidence, default-artifact import in a static host, and actual presented GPU screenshots/pixels from Step 4.1. Record tested environment and reviewer; no external approval is assumed.

Completion gate: each AC1–AC9 row below has passing focused and integration evidence, unchanged shader/runtime/static behavior remains verified, and no outstanding blocked live gate is reported as passing. PR creation/merge is a **separate review/approval action**, not an automatic plan step. Evidence: Not run.

Phase exit gate: feature-complete local implementation satisfies the governing spec and is ready for review; if a live gate is unavailable, mark the feature Blocked or seek explicit accepted deviation without silently weakening the spec. Evidence: Not run.

## Final acceptance

| Spec acceptance ID | Owning step / gate | Verification and expected result                                                                                                  | Evidence / status |
| ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| AC1                | 1.1–1.2            | Typed helper/inference and invalid calls/captures in core + TypeScript 7 hovers/ranges.                                           | Pending; not run  |
| AC2                | 2.1, 2.3           | Virtual + CLI mixed/helper-only/transitive graph, aliases and cycle/missing-export diagnostics; reachable-only emission.          | Pending; not run  |
| AC3                | 2.2, 4.1           | Imported schema metadata/type parity and independent WebGL/WebGPU runtime defaults/updates.                                       | Pending; not run  |
| AC4                | 2.1, 2.3, 3.1–3.2  | Equivalent virtual, project CLI, Vite and editor resolution; unsupported imports fail at authored file/range.                     | Pending; not run  |
| AC5                | 2.3, 3.1–3.2       | Shared fault reported once; dependent Vite rebuild and real editor hover/diagnostic refresh, ordinary `.ts` delegated.            | Pending; not run  |
| AC6                | 1.1, 4.1           | Reachable-once real GLSL ES 3.00/WebGL and WGSL pipeline plus pinned **presented WebGPU** pixels.                                 | Pending; not run  |
| AC7                | 3.1, 4.2           | Host named imports fail and production dual/WebGL-only bundles contain artifact, not authored source/compiler.                    | Pending; not run  |
| AC8                | 3.3                | Local helper renders in REPL; unresolved external import never fetches/replaces installed shader.                                 | Pending; not run  |
| AC9                | 1.1, 4.2           | Direct invalid builtins inside helper diagnosed; `root(-1)` remains documented caller precondition without invalid-pixel promise. | Pending; not run  |

## Rollback and recovery

The feature has no persistent data migration or destructive external operation. Keep old source-only compile and renderer contracts active until graph output and static consumers have passing parity tests. Within an unmerged implementation, revert a failing step and its dependent work as a unit; for a broken public helper path revert the atomic Phase 1 local-helper group or the Phase 2–3 cross-file group rather than leaving exposed syntax with no target/editor/consumer support. A Vite/CLI project-resolution failure must not be hidden by returning a stale or partial artifact; restore the last known-good compile path while fixing resolution. Ordinary runtime failed-replacement preservation remains owned by the existing renderer contract. No commit, push, PR or merge is authorized by this document.

## Deferred checks and accepted deviations

- None accepted. Real VS Code and presented WebGPU gates may be unavailable on a particular machine; record them Blocked with environment details, or obtain explicit acceptance of a deviation and follow-up. A passing mock/WGSL-module test is not a substitute.
- Defer package imports, barrel/namespace imports, a multi-file REPL UI, type-polymorphic helpers, module-value captures, recursion and interprocedural domain proofs per [spec-2.md](spec-2.md). Do not attach an implied schedule or treat those as silently supported by this plan.
