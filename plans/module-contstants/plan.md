# Static module constants implementation plan

## Status and governing source

- Governing spec: [spec.md](spec.md). The user agreed to earlier same-file scalar/vector constants with literals, supported `vec2/3/4` constructors, and aliases; **no module-initializer arithmetic**.
- Delivery state: **Planning only.** All boxes below are pending; no implementation or verification has been performed for this plan. A completed plan is not publication approval.
- Blocker at the Phase 0 gate: if the TypeScript 7 virtual-source path cannot give `const R = 0.1` a shader-only `Expr<F32>` interpretation without changing ordinary TypeScript or losing authored ranges, stop for contract review instead of shipping compiler-only support.

**Checklist policy:** Update `plan.md` by checking tasks, step completion gates, and phase exit gates only. A task is not a passed gate; a phase cannot advance until its exit gate passes. Keep command results, environments, failures, deviations, and approvals in separate `plans/module-contstants/evidence/` notes **when needed**, not in this checklist. Leave a blocked gate unchecked. Change the plan text only for material scope/direction changes; do not add progress reports or a duplicate status table.

## Execution constraints

- Paths are repository-relative. Preserve unrelated worktree changes, including the separate square-matrices plan move. The expected-file lists are estimates, not authorization to edit unrelated files.
- **Never execute an authored `.shdr.ts` module as JavaScript.** No new runtime binding, uniform-default expression, host setter, imported constant export, general capture, or REPL source-module fetch. Existing helper/schema imports, f32 and original-source diagnostics, JSON artifact, automatic/custom/resource metadata and bindings, static-consumer compiler exclusion, and installed-shader preservation must remain intact.
- Existing observations are static inspection only: `parse-shader-file.ts` and `parse-shader-functions.ts` identify shader boundaries, `validate-shader-syntax.ts` rejects outer captures, `shader-module-graph.ts` lowers imported helpers in their defining file, and `transform-shader-expressions.ts` rewrites shader-region expressions for TypeScript 7. Existing `shdr/internal` has a number-to-`Expr<F32>` type bridge; its suitability for module constants has **not** been verified. Record pre-existing failures separately from feature regressions.
- All steps keep old shaders buildable. Steps 1.2–2.3 are one **atomic feature merge/revert group**: a compiler that admits captures but has no corresponding editor/consumer parity is not a finished or independently publishable language feature. Delivery is **one feature-complete PR**, not a PR per step. Phase 0 and Step 1.1 are preparatory review boundaries, not author-facing release points.
- Real acceptance means actual WebGL 2 pixels **and presented WebGPU** pixels in Chromium, with recorded finite inputs/tolerances. An unavailable GPU adapter or VS Code executable is Blocked, not passing evidence from mock tests or generated strings. No deployment/publishing is authorized by this plan.

## Phase overview and delivery boundary

| Phase | Outcome                                                                          | Depends on | Exit gate                                                                                                    |
| ----- | -------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| 0     | Baseline and editor type-bridge feasibility                                      | Spec       | Ordinary TS isolation and authored-range mapping strategy demonstrated, or stop for review                   |
| 1     | Static constants and same-file captures lower in single-source and helper graphs | Phase 0    | Core/public checks and generated GLSL/WGSL target compilation; old graph cases unchanged                     |
| 2     | Editor, CLI/Vite/REPL and real-browser parity                                    | Phase 1    | Project/consumer checks, pixels on both renderers, existing runtime/bundle regressions, workspace acceptance |

## Phase 0 — Baseline and type-bridge gate

Outcome: demonstrate a source-mapped scalar/vector typing strategy without weakening normal TypeScript or changing product scope.
Depends on: Spec.
Review boundary: focused characterization and feasibility; no production parser, compiler, or editor feature is shipped.

### Step 0.1 — Characterize source and editor constraints

Requirements / acceptance: R3–R5; AC1 and AC6 **feasibility only** (behavioral proof is in Phases 1–2).
Depends on: None.
Review boundary: current single-source, helper-only, imported-helper, and ordinary `.ts` boundaries; do not run authored modules.

Expected files:

- `packages/language-service/test/module-constant-feasibility.test.ts` (new, **if** a focused in-memory characterization is useful) — probe source-map/TypeScript 7 type bridge without claiming feature support.
- `plans/module-contstants/evidence/phase-0.md` (new **only if** consequential findings/decisions need review) — results outside the checklist.

Tasks:

- [x] Record current focused core, language-service, CLI, and runtime/browser baseline results; separate pre-existing failures from new failures.
- [x] Probe in memory whether a top-level scalar `number` can be interpreted as `Expr<F32>` **only at shader references**, and vector-constant constructor inputs can type-check, with original-source hovers/errors and unchanged ordinary `.ts` behavior. Inspect both fragment and helper-only virtual regions.
- [x] Trace graph/check-only handling of local constants in an imported helper's defining file, unrelated top-level host code, and the absence of a constant export/import protocol. Identify the narrow parser/lowering seam and any source-range ownership risks.
- [x] If the type bridge or original-source mapping contradicts R4/R5, document the conflict and stop for spec review; do not hide virtual helper cascades or make plain `tsc` execute/accept arbitrary shader syntax.

Verification:

- Automated: use existing `pnpm --filter @shdr/core test` and `pnpm --filter @shdr/language-service test` as **baseline commands**; if the proposed feasibility test is added, run `pnpm --dir packages/language-service exec vitest run --config ../../vitest.config.ts --root . test/module-constant-feasibility.test.ts`. The probe establishes possible typing/mapping, **not** end-to-end shader support.
- Manual: Not needed for this in-memory proof. The actual VS Code experience is checked in Step 2.1; no GPU claim is made here.

- [x] **Completion gate:** A bounded editor/source-graph approach appears feasible, and current failures/baselines are recorded outside this plan; otherwise stop for spec review.

- [x] **Phase exit gate:** Review the TypeScript 7 bridge, shader-only scope, defining-file resolution, and baseline before Phase 1; no production capability is claimed.

## Phase 1 — Static source and lowering

Outcome: referenced, eligible module constants become typed values in fragments and helpers on both targets without interpreting arbitrary top-level code.
Depends on: Phase 0 exit.
Review boundary: core parser, graph, lowering and generated-target checks. Complete editor and consumer acceptance remains Phase 2.

### Step 1.1 — Recognize eligible top-level declarations on demand

Requirements / acceptance: R1, R3; AC1 (declaration portion) and AC3 (syntax/dependency diagnostics portion). Shader captures and targets remain Steps 1.2–1.3.
Depends on: Phase 0 exit.
Review boundary: static declaration/initializer classification and file/range diagnostics only; old shader capture rejection remains in effect.

Expected files:

- `packages/core/src/parse-module-constants.ts` (new if appropriate), `packages/core/src/{parse-shader-file,parse-shader-functions,shader-module-graph}.ts` — shared definition discovery for fragments and helper-only modules without interpreting code.
- `packages/core/test/module-constants.test.ts` (new) and existing graph tests — syntax/eligibility and on-demand negatives, source-file range ownership.

Tasks:

- [x] Classify only referenced simple top-level `const` declarations: finite f32 numeric literals/negative literals, prior same-file constant references, and existing `vec2/3/4` constructor signatures with directly imported callables. Keep unsupported host declarations inert unless used in a shader.
- [x] Detect forward/self references, invalid alias chains, wrong-shape constructors, reserved/conflicting names and f32 overflow at authored definition/use ranges. No arithmetic, general JS calls, imported constant names, uniform-default references, or execution.
- [x] Preserve helper/schema parse boundaries and unchanged diagnostics for old captures; avoid accidentally treating `defineShaderFunction` or `defineUniforms` declarations as module constants.
- [x] Add focused parser/graph tests for valid chains and invalid/unused host declarations, including a constant visible only within its defining file.

Verification:

- Automated: **proposed** `pnpm --dir packages/core exec vitest run --config ../../vitest.config.ts --root . test/module-constants.test.ts`, plus `pnpm --filter @shdr/core check`; assert eligible shapes and authored ranges without claiming generated shader use yet.
- Manual: Not needed for static classification. No change should make a previously supported shader or ordinary host file fail.

- [x] **Completion gate:** Eligible definitions are classified on demand with accurate failures, existing shader capture behavior still rejects references, and core builds/checks without executing source.

### Step 1.2 — Fragment capture, IR and target codegen

Requirements / acceptance: R1–R4, R6; AC1 (fragment/core portion), AC3 (capture negatives), AC4 (target-compilation portion), AC5 (JSON/artifact portion). Helpers/editor/rendering remain Steps 1.3 and 2.1–2.3.
Depends on: Step 1.1.
Review boundary: fragment-only permitted captures and target-neutral typed values; still no public completeness claim.

Expected files:

- `packages/core/src/{validate-shader-syntax,normalize-shader-syntax,lower-shader-syntax,lower-fragment,shader-ir,generate-glsl-expression,generate-wgsl-expression}.ts` and relevant fragment generators — scope-safe resolution and target output (exact subset determined by whether values are inlined or emitted).
- `packages/core/test/{module-constants,backend-parity}.test.ts` (new/extended) — scalar/vector aliases, constructor shapes, diagnostics, constant isolation, generated-target checks.

Tasks:

- [ ] Resolve only eligible same-file module names **after** shader-local/parameter names; preserve local forward-reference checks and reject other outer values as captures. Do not widen unrelated expression syntax.
- [ ] Lower f32 scalar/vector constants through target-neutral IR without reassociation or host-JS evaluation; preserve scalar rounding, signed-zero and overflow policy and safe emitted names. If using shader globals instead of inlining, verify no binding or artifact-schema changes.
- [ ] Keep invalid/unknown captures source-located, prohibit module constants in literal-only uniform defaults, and ensure failure yields no candidate artifact.
- [ ] Check generated GLSL shader compilation/link and WGSL module/pipeline validation in real targets for fragment-only constants, plus negative and old-artifact parity tests. No sampled/rendered-pixel claim yet.

Verification:

- Automated: focused **proposed** core `test/module-constants.test.ts`, `pnpm --filter @shdr/core check` and `pnpm --filter @shdr/core test`; assert typed IR, both generated targets, unchanged JSON/default/resource metadata, and existing capture failures. Target tests prove compilation, not rendered behavior.
- Manual: Not needed for fragment-only target checks; real browser pixels are required at Step 2.3.

- [ ] **Completion gate:** Fragment constants compile and negative captures fail at authored ranges with unchanged old artifacts; helper/project/editor acceptance remains pending under the atomic 1.2–2.3 group.

### Step 1.3 — Helper and multi-file graph ownership

Requirements / acceptance: R2, R3, R5; AC1 (helper/core portion), AC2 (graph/core portion), AC3 (import/forward errors), AC6 (defining-file diagnostics portion). Tool refresh remains Phase 2.
Depends on: Step 1.2.
Review boundary: helper bodies own their module's constants; no cross-file constant import is added.

Expected files:

- `packages/core/src/{shader-module-graph,parse-shader-functions,lower-shader-functions,lower-shader-syntax}.ts`, `packages/core/test/{reusable-graph,module-constants}.test.ts` — defining-file environment, helper-only/check-only parity and graph error ownership.
- `packages/project/test/project.test.ts` (only if graph loading needs a regression fixture) — selected-project file identity remains unchanged.

Tasks:

- [ ] Resolve constants in the file **defining** each local or imported helper, never from the fragment that calls it; preserve transitive helper reachability and existing named helper/schema import rules.
- [ ] Support a helper-only `.shdr.ts` module with private constants, and same-file entry plus helper, including valid local/parameter shadowing and two entries importing one helper. Check-only mode must identify invalid referenced constants in helpers even if no fragment export exists.
- [ ] Return defining-file authored ranges once for invalid shared definitions without cascaded caller faults; reject imported constant names, unsupported host captures, and nonliteral uniform defaults.
- [ ] Assert identical target-neutral meaning for equivalent single-source/virtual graphs, stable file IDs, and no emitted runtime named constant export.

Verification:

- Automated: focused **proposed** core graph fixtures in `packages/core/test/{reusable-graph,module-constants}.test.ts`, `pnpm --filter @shdr/core test`, and (if affected) `pnpm --filter @shdr/project test`. Check original file/range, multi-entry isolation and import negatives; one passing fragment is not proof for a helper-only source.
- Manual: Not needed for core graph ownership; actual editor/project invalidation is Step 2.2.

- [ ] **Completion gate:** Single-source and imported helper graphs use only defining-file constants, with source-owned errors and unchanged helper/schema imports. Editor/host parity remains pending.

- [ ] **Phase exit gate:** `pnpm build`, `pnpm --filter @shdr/core check`, focused core/graph suites, and real GLSL-link/WGSL-pipeline tests pass without breaking old helpers; review the atomic pending consumer work before Phase 2.

## Phase 2 — Editor, consumer and rendered acceptance

Outcome: TypeScript 7 and consumer checks agree with core, static hosts stay isolated, and rendered WebGL/presented-WebGPU output proves the value contract.
Depends on: Phase 1 exit.
Review boundary: accepted tooling/consumer paths and browser evidence; no new module import, uniform, renderer or reference-fidelity feature.

### Step 2.1 — Shader-only virtual typing and source-located editor results

Requirements / acceptance: R1–R5; AC1 (type/editor portion), AC2 (editor refresh portion), AC3 (editor diagnostics portion), AC6 (editor portion). Consumer/browser proof remains Steps 2.2–2.3.
Depends on: Phase 1 exit.
Review boundary: TypeScript 7 virtual-source transform and mapped check/hover, including helpers, without taking ordinary `.ts` ownership.

Expected files:

- `packages/core/src/{transform-shader-expressions,create-virtual-source,mapped-text-writer}.ts` (as needed), `packages/language-service/src/{typescript-7-editor-adapter,typescript-7-checker}.ts` (only if existing routing cannot express the contract).
- `packages/language-service/test/module-constants-editor.test.ts` (new), `packages/language-service/test/fixtures/project/` (new shader/helper fixtures), `apps/editor-fixture/` (texture-independent shader and UI fixture as needed).

Tasks:

- [ ] Map accepted numeric module values to `Expr<F32>` only inside shader regions, and type-check vector initializers built from earlier scalars without transforming unrelated code or requiring authored JS execution. Preserve original-file hovers and diagnostics for definitions and uses.
- [ ] Check fragment, same-file helper, imported helper-only module, shadowed names, invalid module initializer and invalid capture; unsaved edits to a helper's constant must refresh its consumers without generated-helper cascades or ordinary `.ts` diagnostic takeover.
- [ ] Add source-ranged TypeScript 7 adapter fixtures and a real VS Code fixture/verifier for representative hover, invalid constant and edit/restore flows; preserve existing VS Code/Zed shared adapter behavior without making the proposed LSP transport migration a prerequisite.

Verification:

- Automated: **proposed** `pnpm --dir packages/language-service exec vitest run --config ../../vitest.config.ts --root . test/module-constants-editor.test.ts`, `pnpm --filter @shdr/language-service test`, and `pnpm --filter @shdr/editor-fixture test`. Assert authored file/offsets, fixed vs unsaved diagnostics, scalar/vector hover types and ordinary `.ts` isolation.
- Manual: run `pnpm --filter @shdr/editor-fixture test:editor` with installed VS Code and a real TypeScript 7-capable fixture; check authored hover/diagnostic and restored edit. If unavailable, mark UI acceptance Blocked rather than equating an adapter unit test with real-editor proof.

- [ ] **Completion gate:** Core and editor agree on accepted values/invalid source, unsaved imported-helper edits refresh, and real VS Code reports correct authored locations; no ordinary TypeScript regression.

### Step 2.2 — Project consumers and static isolation

Requirements / acceptance: R2, R3, R5, R6; AC2 (CLI/Vite refresh portion), AC3 (CLI portion), AC5 (Vite/static portion), AC6 (project/isolation portion). REPL and pixels remain Step 2.3.
Depends on: Step 2.1.
Review boundary: existing CLI, Vite and project-graph consumers only; no newly importable constant value.

Expected files:

- `packages/cli/test/cli.test.ts`, `packages/vite/test/index.test.ts`, `packages/project/test/project.test.ts` (only if selection changes) — check-only helper files, path aliases and dependent invalidation.
- `apps/vite-basic/src/module-constants.shdr.ts` (new), `apps/vite-basic/{verify-build,verify-dev,verify-render}.mjs` (extend as needed) — static JSON consumer, affected edit/rebuild, unchanged prior shaders.

Tasks:

- [ ] Check same-file and imported-helper constant fixtures through CLI and project-backed Vite, including fixes/re-edits in a helper-only source and an explicit rejected attempt to import a constant as a shader dependency.
- [ ] Verify `defineUniforms` defaults stay literal-only; imported schema contents, bindings, artifact JSON, old shader builds, HMR dependency tracking and stale/failed candidate behavior remain unchanged.
- [ ] Audit Vite production output for parser/compiler, top-level constant execution and named runtime constant exports; only the fragment's default artifact is consumed.

Verification:

- Automated: `pnpm --filter @shdr/cli test`, `pnpm --filter @shdr/vite test`, `pnpm --filter vite-basic test`, `pnpm --filter @shdr/project test` (if affected), and `pnpm ci:check` after rebuilding relevant packages. Extended fixtures must assert actual dependency refresh and static bundle contents, not just the presence of generated GLSL strings.
- Manual: Not needed where Vite dev/HMR and static build requests are exercised in existing browser scripts; if a project-config alias variant cannot be automated, record its limitation outside this plan before acceptance.

- [ ] **Completion gate:** CLI/Vite edits and diagnostics track defining files, static bundles contain no compiler/authored execution, and old schemas/renderers remain unchanged.

### Step 2.3 — REPL, real-browser pixels and contract documentation

Requirements / acceptance: R1–R7; AC4 (complete browser proof), AC5 (REPL/browser portion), AC6 (runtime/integration portion), with final review of AC1–AC3 from their owning gates.
Depends on: Steps 2.1–2.2.
Review boundary: single-textarea browser path, both actual GPU outputs and documentation; no reference-port fidelity claim.

Expected files:

- `apps/repl/verify-browser.mjs` (extend for local constants and forbidden external import; `App.tsx` only if existing display needs adjustment).
- `packages/runtime/test/verify-module-constants.mjs` (new if focused browser harness needed), `packages/runtime/package.json` (wire only if added); `apps/vite-basic/src/` (reuse the fixture from Step 2.2).
- `README.md`, `packages/shdr/README.md`, `plans/language-exntesion.md` (update delivered status **only after acceptance**), `plans/module-contstants/evidence/` (new files only for consequential reproducibility/results).

Tasks:

- [ ] Compile and render finite pinned scalar/vector constant cases, same-file helper capture and an imported helper owning its own constant. Assert non-square/top-left behavior, safe names, scalar f32 values, and tolerant real WebGL readPixels **and presented WebGPU** pixels; verify actual target compilation/link/pipeline, not just shader snapshots.
- [ ] In the existing REPL textarea, compile/render local constants; an unsupported external constant import or invalid edit must report a source diagnostic without fetching `.shdr.ts` or replacing the healthy previews. Re-run old numeric uniform/default and texture/resource rendering cases for isolation.
- [ ] Document the accepted initializer grammar, scalar `number` vs shader `Expr<F32>` distinction, same-file/helper boundary, rejected imports/arithmetic, f32 caveats and deferred work. Review AC1–AC6 against owning gates and check the final diff for bundle/isolation regressions.

Verification:

- Automated: **proposed** `node test/verify-module-constants.mjs` from `packages/runtime` once added and wired, plus existing `pnpm --filter @shdr/runtime test`, `pnpm --filter repl test`, `pnpm --filter vite-basic test`, `pnpm build`, `pnpm check`, `pnpm test`, `pnpm ci:check`, Prettier check and `git diff --check`. A focused browser test must assert real pixels, independent backend errors, intact old artifacts and no compiler in static output. Run the broad workspace gate here, not after every earlier step.
- Manual: confirm a working Chromium WebGL 2 context and **presented** WebGPU adapter, record environment and sampled pixel tolerances outside this plan; if unavailable, mark browser acceptance Blocked. Re-run real-editor verification if Step 2.1 fixture or adapter changed afterward.

- [ ] **Completion gate:** Each AC1–AC6 has owning verification, both real browser targets and editor/consumer paths pass, docs match the shipped boundary, and no unsupported capture/import or artifact change is introduced.

- [ ] **Phase exit gate:** Review build/check/test/CI, real editor and WebGL/presented-WebGPU acceptance, REPL import isolation, Vite static bundle and old uniform/resource regressions. Stop before merge/publish; accept only a feature-complete change with explicitly recorded residual risks outside this plan.

## Final acceptance

| Spec acceptance ID | Owning step / gate      | Verification and expected result                                                                                                         |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AC1                | 1.1–1.3, 2.1            | Eligible scalar/vector definitions and shadowed fragment/helper uses are typed and lowered, with editor parity and no authored execution |
| AC2                | 1.3, 2.1–2.2            | Imported helper uses only its defining file's constant; edit refresh and defining-file ranges, without an importable constant            |
| AC3                | 1.1–1.3, 2.1–2.2        | Invalid and unused host declarations, forward refs, arithmetic and imports produce appropriate source-owned diagnostics/no artifact      |
| AC4                | 1.2 (target check), 2.3 | Real GLSL/WGSL target validity and rendered WebGL/presented-WebGPU finite pixels within recorded tolerances                              |
| AC5                | 1.2, 2.2–2.3            | JSON/bindings/static isolation, literal uniform defaults, and REPL local-only success/failed-edit preservation                           |
| AC6                | 1.3, 2.1–2.3            | Shared definition errors and edit/restore route to original files without duplicate cascades or runtime/default regressions              |

This is a static ownership index, **not** a second completion checklist. Record outcomes separately and check off the owning gates here only after verification and review.

## Rollback and recovery

No persistent migration or destructive action is planned. Retain existing no-capture and literal-default behavior for all other source. If editor/project integration fails after core begins accepting constants, revert the **1.2–2.3 atomic group together** rather than merging compiler-only semantics. A failed shader compile produces no candidate artifact; invalid edits keep the currently installed shader where existing renderer/REPL behavior permits. Browser adapter/editor availability is a blocked acceptance gate, not permission to silently reduce target scope.

## Deferred checks and accepted deviations

- No accepted deviations or executed checks at planning time. Document any later exception and its reviewer outside the checklist; leave the affected gate unchecked unless the governing spec/plan is materially revised.
- Cross-file constant imports, module-initializer arithmetic/builtins, matrix/texture constants, constant-derived uniform defaults, host updates, broader capture/control flow, reference-port fidelity, and publishing/install testing remain outside this slice unless separately scoped.
