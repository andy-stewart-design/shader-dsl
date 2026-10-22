# Fragment derivatives implementation plan

## Status and governing source

- Governing contract: [spec.md](spec.md).
- Delivery state: **Implementation in progress**. Steps 0.1, 0.2, 1.1, 1.2, 2.1, 2.2, and 2.3 and the Phase 0/1/2 exit gates are Verified; Phase 3 remains Pending. See each step's evidence below.
- Remaining work: Phase 3 rendered acceptance/documentation, followed by review. Merge and publication remain pending; a plan is not permission to perform those actions.
- Blockers: None currently. Raw WebGL/WebGPU probes pass under Playwright Chromium/SwiftShader, and the installed VS Code real-editor gate passes.

Step statuses below are the authoritative execution record. A phase completes only after its steps **and** its exit gate pass. Checked tasks alone do not verify a step; `Verified` includes its scoped gate and review, not user approval or release. Manual approvals in supervised execution belong to extension state.

## Execution constraints

- All paths and commands are relative to the repository root. Preserve unrelated changes and stable step IDs; spec conflicts require review, not quiet scope changes. Keep this file a checklist/compact progress index; put consequential findings in linked evidence notes only when useful.
- Existing repository scripts: root `pnpm build`, `pnpm ci:check`, `pnpm test`; package `check`/`test` scripts; `@shdr/editor-fixture` `test:editor`. Target tests use Playwright/Chromium; runtime scripts use compiled package exports. A focused `pnpm --filter ... exec vitest run --config ../../vitest.config.ts --root . test/<file>` runs from the package root; after source changes run `pnpm build` before testing consumers of `dist` exports or `pnpm shdr check`.
- Required for execution: Node 24+, pnpm 11.23.0, existing dependencies, Chromium with WebGL 2 and WebGPU (SwiftShader is acceptable with its identity recorded), and installed VS Code for real editor verification (`VSCODE_EXECUTABLE_PATH` if nondefault). This plan does not install any of them. Some existing package `pretest` hooks can install Playwright Chromium: where machine changes are not approved, use direct `exec vitest` / `exec node` with an **already installed** browser instead of `pnpm test`; do not treat an omitted suite as passed. Report unavailable mandatory targets as **Blocked**.
- No current green baseline is claimed. Existing historical target tests and completed plans prove prior revisions only; record current revision, versions, available targets, and pre-existing failures separately from derivative regressions in Phase 0. New test/script files named below are **proposed** and not runnable until their owning steps add them.
- Source stays static: no authored `.shdr.ts` evaluation, no REPL import fetches, no runtime derivative computation or artifact schema/binding changes. Keep the existing straight-line fragment-only grammar and numeric policy. Sample smooth interior pixels, not quad edges; distinguish compile/link/module validation from _presented_ rendered pixel evidence.

## Phase overview and delivery boundary

| Phase | Outcome                                                                          | Depends on              | Exit gate                                                              |
| ----- | -------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| 0     | Reproducible baseline and raw signed-Y/helper target feasibility                 | Installed prerequisites | Reviewed evidence and no unresolved target contradiction               |
| 1     | Public/core derivative contract emitted on both targets, including helper graphs | Phase 0 exit            | Complete type/core/graph and real generated-target link/pipeline proof |
| 2     | Tool and app consumers agree on diagnostics, edits, and static isolation         | Phase 1 exit            | Editor/CLI/Vite/REPL composition with actual editor and browser checks |
| 3     | Rendered derivative behavior, regression and documentation accepted              | Phase 2 exit            | AC1–AC6 accounted for with real WebGL/presented-WebGPU evidence        |

Delivery boundary: **one feature-complete PR** after Phase 3; phases/steps are review increments, not independently publishable derivative releases. Atomic group: Step 1.1 must include public overloads, builtin validation, constant-analysis handling, **both** emitters and focused tests in one revert unit; do not leave types claiming an unimplemented target. Steps 1.1–3.2 are delivered/reverted together if abandoning the feature. Baseline probes do not activate a public builtin.

## Phase 0 — Baseline and raw-target gate

Outcome: An honest starting point and a viable target strategy before accepting authored derivatives.
Depends on: Execution prerequisites; none of the feature steps.
Review boundary: Baseline and raw standalone probes only; no change to accepted Shdr calls.

### Step 0.1 — Establish a reproducible baseline

Status: Verified (baseline checks); editor prerequisite unavailable
Requirements / acceptance: R7–R8; AC6 (baseline only; feature regression belongs to Steps 1.2 and 3.2).
Depends on: None.
Review boundary: Read-only checks and classification; a prerequisite fix would need its own reviewed scope.

Expected files:

- `plans/fragment-derivatives/plan.md` — concise status/evidence update.
- `plans/fragment-derivatives/evidence/phase-0.md` — **add only if needed** for material environment/failure evidence.

Tasks:

- [x] Inspect revision/worktree state, actual tool versions, built-export health, and current target/editor prerequisites; do not alter unrelated work.
- [x] Establish whether existing core, public type, graph, and editor suites build and pass at this revision; classify pre-existing failures and capability gaps separately.
- [x] Record the starting contract (GLSL top-left `coord.y`, WGSL position Y, straight-line helper reachability) and any existing safety concerns without claiming derivative support.

Verification:

- Automated, root, existing: `pnpm build`; `pnpm --filter shdr check`; `pnpm --filter @shdr/core check`; `pnpm --filter @shdr/language-service check`; `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/reusable-graph.test.ts test/orbit-generated.test.ts`. Expected: actual current results and a triaged baseline, **not** assumed all-green.
- Manual: Review revision, tool/browser/editor availability and reported errors before attributing later failures. No new derivative pixels are proven here.

Completion gate: Baseline results and blockers recorded with revision; any prerequisite failure that prevents meaningful target tests is resolved or marks the dependent phase Blocked.
Evidence: [evidence/phase-0.md](evidence/phase-0.md) — baseline commands passed; configured VS Code executable unavailable.

### Step 0.2 — Probe raw derivative signatures, signs, and helper uniformity

Status: Verified — raw target feasibility probe passes
Requirements / acceptance: R1–R4, R8; AC1/AC2/AC4 (**raw feasibility only**; generated/public/presented acceptance remains Steps 1.1–3.1).
Depends on: Step 0.1.
Review boundary: Raw GLSL/WGSL fragment probes; no compiler/DSL acceptance or full reference shader port.

Expected files:

- `packages/core/test/fragment-derivatives-target-feasibility.test.ts` — **new**, standalone raw-target Playwright/Vitest probes using the existing target-feasibility pattern.
- `plans/fragment-derivatives/evidence/phase-0.md` — **add only if useful**, record targets, shape/helper observations and tolerance rationale.

Tasks:

- [x] Compile/link raw GLSL ES 3.00 and validate WGSL shader **and render pipeline** for all three unary names on scalar and Vec2/3/4 f32, including a reachable straight-line helper (probe real WGSL derivative uniformity, not just parsing).
- [x] Draw pinned finite, smooth interior fields on non-square canvases using native target positions, explicit GLSL negative `dFdy` **result**, and WGSL `dpdy`; compare positive/down and reconstructed-up signs and lane-wise `fwidth` magnitudes. Keep raw observations separate from generated-shader acceptance.
- [x] Encode signed values into visible channels with a documented mapping (e.g. `0.5 + 0.25 * slope`) and set tolerances from quantization and observed target accuracy **before** using them as generated-feature gates; do not tune tolerances to excuse a missing sign flip.
- [x] Record adapter/browser/backend capability and what was compiled versus drawn; if a target or helper case fails, stop for spec review rather than silently narrowing helpers or inventing fallback values.

Verification:

- Automated, root, **after adding the probe**: `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/fragment-derivatives-target-feasibility.test.ts`; `pnpm --filter @shdr/core check`. Assert all agreed raw shapes and helper pipelines accept, Y signs discriminate wrong emission, width is approximately component-wise, and target absence fails/blocks rather than skips.
- Manual: Review raw captures/logged environment and proposed tolerances. These tests cannot prove authored-source diagnostics, Vite isolation, or presented WebGPU runtime behavior.

Completion gate: A viable strategy for all agreed raw shapes and reachable helpers is evidenced; any material contradiction blocks Phase 1 pending a reviewed product decision/spec revision.
Evidence: [evidence/phase-0.md](evidence/phase-0.md); raw WebGL link/draw/readback and WGSL module/pipeline/offscreen draw/readback pass, including signed Y, vector lanes, and helper use.

Phase exit gate: Complete for raw feasibility. Focused probe plus `test/reusable-graph.test.ts` passed (2 files / 16 tests), and `pnpm --filter @shdr/core check` passed. Real editor remains unavailable, but is not a Phase 0 target-feasibility gate; no editor acceptance is claimed.

## Phase 1 — Public and compiled fragment contract

Outcome: All twelve signatures compile through static lowering and both backends, including imported helpers, without new bindings or CPU derivative evaluation.
Depends on: Phase 0 exit.
Review boundary: Public language, core validation and artifact generation; consumer interfaces and rendered acceptance follow.

### Step 1.1 — Add complete unary types and both emitters atomically

Status: Verified
Requirements / acceptance: R1–R5, R7; AC1 (public/core/direct-fragment portion), AC2/AC4 (generation/target compilation portion), AC3 (core negatives). Graph/editor/rendered portions remain Steps 1.2, 2.1 and 3.1.
Depends on: Phase 0 exit.
Review boundary: Exactly `dFdx`, `dFdy`, `fwidth` for f32 scalar/Vec2/3/4 in direct-imported straight-line fragments; no new grammar or backend-only signatures.

Expected files:

- `packages/shdr/src/{math,index}.ts`; **new** `packages/shdr/test/fragment-derivative-types.ts` — exact compile-only overloads/exports and positive/negative type assertions.
- `packages/core/src/{shader-builtin,evaluate-shader-constant,generate-glsl-expression,generate-wgsl-expression}.ts`; `packages/core/src/lower-shader-syntax.ts` **only if needed** — enforce exact unary shapes, handle unknown screen-space results in conservative constant analysis, and emit native calls with GLSL _result_ negation/parenthesization. Preserve existing reserved-name safety.
- **New** `packages/core/test/fragment-derivatives.test.ts` — authored-shape/diagnostic/output tests and real generated-target compilation/link/pipeline checks for all twelve signatures.

Tasks:

- [x] Add public unary overloads and exports without a host runtime implementation; assert all twelve returns and rejected host numbers, arities, matrices, mixed/union shapes.
- [x] Register a shared unary-same f32 shape rule, retain direct import enforcement, and ensure bad calls/captures/control-flow syntax diagnose original source with no usable artifact.
- [x] Keep derivative results unknown to compile-time numeric evaluation, even for literal arguments; preserve locally provable invalid-f32 handling for operands without fabricating derivative constants.
- [x] Emit GLSL `dFdx(x)`, `-dFdy(x)`, `fwidth(x)` and WGSL `dpdx(x)`, `dpdy(x)`, `fwidth(x)`; test nested expression grouping and ensure no transform applies to `fwidth` or the GLSL argument instead of the result.
- [x] Add direct-fragment scalar and distinct-lane vector fixtures, core negatives, and a real generated GLSL-link/WGSL-pipeline test; no claims about presented pixels yet.

Verification:

- Automated, root: `pnpm build`; `pnpm --filter shdr check`; `pnpm --filter @shdr/core check`; focused derivative and existing builtin parity/IR tests (4 files / 79 tests). Type assertions cover the twelve returns and rejects; generated tests compile/link GLSL and validate a WGSL pipeline for all twelve signatures.
- Manual: Reviewed emitter diff for symmetric target coverage and no runtime/IR artifact schema additions; review caught/fixed a temporary WGSL `sin`/`cos` mapping regression and a generated-GLSL nested-unary `--` token bug. Added a real generated GLSL link regression for authored `-dFdy(coord.y)`. Compilation is not rendered semantic proof.

Completion gate: A direct-fragment derivative call passes public types, core diagnostics, **both generated target compilers/pipelines**, and review with no newly accepted one-target-only signature. This step and the rest of the feature are not individually mergeable.
Evidence: `packages/shdr/test/fragment-derivative-types.ts`; `packages/core/test/fragment-derivatives.test.ts`; source/backend changes listed above. Repaired nested-unary GLSL and all focused target gates pass; generated target validation is not presented-pixel acceptance.

### Step 1.2 — Preserve helper graphs, ownership and artifact invariants

Status: Verified
Requirements / acceptance: R1, R4–R7; AC1 (helper/graph and defining-file portion), AC3 (invalid helper portion), AC6 (core artifact portion). Editor/CLI, static-consumer and runtime portions remain Phases 2–3.
Depends on: Step 1.1.
Review boundary: Local, helper-only and imported `defineShaderFunction` cases, edits, diagnostics and existing artifact schema; no expanded stage grammar.

Expected files:

- **New** `packages/core/test/fragment-derivatives-graph.test.ts`; `packages/core/test/fragment-derivatives-generated.test.ts` — virtual/real helper graphs and target linking cases.
- `packages/core/src/{parse-shader-functions,shader-module-graph,lower-shader-functions}.ts` **only if a demonstrated graph gap requires it** — preserve ownership and fragment-stage reachability; do not add general stages.

Tasks:

- [x] Exercise scalar/vector derivatives inside local and imported helper-only modules (including nested helper calls); prove both generated targets compile/link with derivative calls in reachable helpers.
- [x] Test helper-source wrong arity, forbidden capture and invalid syntax; assert diagnostics point to the defining file/range and editing the helper invalidates stale acceptance without generating a candidate artifact.
- [x] Compare artifact JSON keys, existing uniform/texture/custom binding metadata and referenced-resource behavior before/after a derivative inside a shader combining math, custom uniforms, sampling and helpers.
- [x] Confirm plain `.shdr.ts` compilation never evaluates shader modules as JS; keep direct named-import checks, safe identifier handling and ordinary shader operations intact.

Verification:

- Automated, root, **after adding tests**: `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/fragment-derivatives.test.ts test/fragment-derivatives-generated.test.ts test/fragment-derivatives-graph.test.ts test/reusable-graph.test.ts`; `pnpm --filter @shdr/core check`. Expect accepted helper graphs to validate on both real targets; negative graphs yield authored diagnostics and no candidate; metadata/bindings unchanged except generated shader code.
- Manual: Inspect any graph-source change for continued defining-file ownership and no dependency on future control flow.

Completion gate: Both target outputs and artifact/diagnostic invariants hold for direct and imported helpers; review complete. Evidence: `packages/core/test/fragment-derivatives-graph.test.ts` and `packages/core/test/fragment-derivatives-generated.test.ts`; 8 focused tests pass, including helper ownership, edit/recovery, no source execution, metadata invariance, GLSL link and WGSL pipeline.

Phase exit gate: Verified. `pnpm build`, `pnpm --filter shdr check`, `pnpm --filter @shdr/core check`, and direct full core Vitest passed (63 files / 562 tests). Direct Vitest was used instead of `@shdr/core test` to avoid its browser-install hook. No graph implementation changes were needed.

## Phase 2 — Editor and consumer integration

Outcome: Compiler consumers expose one source-mapped derivative contract without widening ordinary TypeScript ownership or evaluating shader imports.
Depends on: Phase 1 exit and rebuilt package exports.
Review boundary: Tests/fixtures and necessary integration fixes, not a new language-service architecture or runtime API.

### Step 2.1 — TypeScript 7 and real-editor parity

Status: Verified
Requirements / acceptance: R1, R5–R6; AC1 (hover portion), AC3 (editor portion), AC5 (editor/refresh portion). CLI/Vite/REPL remain Steps 2.2–2.3.
Depends on: Phase 1 exit.
Review boundary: Diagnostic routing and QuickInfo for derivative calls, local/imported helpers and edit refresh; ordinary `.ts` ownership stays unchanged.

Expected files:

- **New** `packages/language-service/test/fragment-derivatives-editor.test.ts`, `apps/editor-fixture/fragment-derivatives.shdr.ts`, `apps/editor-fixture/shared/fragment-derivative-helper.shdr.ts` and optionally an invalid fixture — typed QuickInfo and source-mapped diagnostics.
- `apps/editor-fixture/run-editor-test.mjs` — extend existing real VS Code checklist; `packages/language-service/src/{typescript-7-editor-adapter,diagnostic-routing}.ts` **only if an evidenced mapping gap requires it**.

Tasks:

- [x] Assert scalar/Vec2/3/4 QuickInfo and zero diagnostics for a valid fragment and typed helper; invalid arity, matrix/texture, missing import and forbidden capture map to original authored spans, not virtual/generated text.
- [x] Test incremental valid → invalid → valid edits in fragment and imported helper, including helper-only ownership and ordinary `.ts` checks; prevent stale/cascaded diagnostics.
- [x] Extend installed VS Code fixture for valid derivative hover and a precise invalid call, without replacing the shared TypeScript 7 adapter or introducing an LSP fork.
- [x] Inspect real editor responses and limitations; real extension-host verification completed.

Verification:

- Automated, root, **after adding the test/fixture**: `pnpm build`; `pnpm --filter @shdr/language-service exec vitest run --config ../../vitest.config.ts --root . test/fragment-derivatives-editor.test.ts`; `pnpm --filter @shdr/editor-fixture build`; `pnpm --filter @shdr/editor-fixture test:editor`. Expect authored hover/diagnostic/edit parity and successful real extension-host check.
- Manual: With installed VS Code fixture, open/edit `fragment-derivatives.shdr.ts`, check signed-call hover, invalid range, helper refresh and ordinary `.ts` language ownership. If the executable is unavailable, mark this gate Blocked, not unit-verified.

Completion gate: Adapter and installed-editor evidence agrees on valid/invalid calls and source locations. Automated VS Code coverage confirms an ordinary `.ts` document retains TypeScript language ownership; it does not verify the standard TypeScript provider's hover behavior, which remains untested. Evidence: `packages/language-service/test/fragment-derivatives-editor.test.ts` (7 tests), `apps/editor-fixture/src/extension.test.ts`; language-service check, editor-fixture build, and `pnpm --filter @shdr/editor-fixture test:editor` passed. Real VS Code testing exposed and fixed a helper-only diagnostic-routing gap: graph `InvalidBuiltin` diagnostics now suppress redundant TypeScript overload cascades; the adapter test asserts exactly one diagnostic.

### Step 2.2 — Project, CLI and static Vite consumers

Status: Verified
Requirements / acceptance: R5–R7; AC3 (CLI/project portion), AC5 (CLI/Vite portion), AC6 (static-bundle/artifact portion). Rendered acceptance remains Phase 3.
Depends on: Step 2.1.
Review boundary: Existing project graph and Vite static transforms, no new browser compiler in static consumers.

Expected files:

- `packages/project/test/project.test.ts`, `packages/cli/test/cli.test.ts`, `packages/vite/test/index.test.ts` — fixture-based derivative graph/edit/failure coverage with temporary projects.
- **New** `apps/vite-basic/src/fragment-derivatives.shdr.ts`, `apps/vite-basic/src/shared/fragment-derivative-helper.shdr.ts`; `apps/vite-basic/src/main.ts`, `apps/vite-basic/verify-build.mjs`, `apps/vite-basic/verify-dev.mjs` — imported artifact, static bundle exclusion and edited dev graph checks.
- Tool source files **only if** fixture tests demonstrate a gap; do not change public artifact/renderer contracts.

Tasks:

- [x] Exercise project/CLI checks of valid helper-only modules and invalid helper edits in temporary projects; assert authored file/range, no artifact for invalid source, and no JS evaluation.
- [x] Import a derivative artifact into a static Vite app and assert built shader text and source maps while excluding Shdr/compiler modules, source evaluation and opposite runtime in the WebGL-only bundle.
- [x] Exercise Vite dev pre-transform edits of fragment/helper, invalid diagnostics and recovery. This verifies transform behavior only; it does not claim that an already-installed app renderer preserves its prior shader after an invalid edit (that is tested in the REPL consumer).
- [x] Verify default and custom uniforms/textures coexist with derivative output without schema or resource binding changes; update tests/fixtures alongside their consumers.

Verification:

- Automated, root: `pnpm build`; `pnpm --filter @shdr/project test`; `pnpm --filter @shdr/cli test`; `pnpm --filter @shdr/vite test`; `pnpm --filter vite-basic test` (includes existing build/dev/render scripts; run direct scripts only with installed browser if hooks would install). Expect graph edits/diagnostics and static bundle isolation; distinguish build output inspection from pixel behavior.
- Manual: Review built output/sourcemap exclusions and ensure the Vite test fixtures, not runtime code, own any new compiler probes.

Completion gate: CLI/project/Vite graph and static-consumer checks pass against rebuilt exports, with no runtime schema or compiler-bundle regression. Evidence: `packages/project/test/project.test.ts` (5 tests), `packages/cli/test/cli.test.ts` (29 tests), `packages/vite/test/index.test.ts` (24 tests), `apps/vite-basic/src/fragment-derivatives.shdr.ts` and `apps/vite-basic/src/shared/fragment-derivative-helper.shdr.ts`; project/CLI/Vite suites, app check/build/static-bundle validation, Vite dev edit/error/recovery, render and texture scripts passed. Vite's existing transform returns `map: null`; production maps include the static entry source but not the erased helper source, while emitted artifacts contain reachable helper code. No plugin mapping behavior was changed.

### Step 2.3 — Browser compiler and REPL edit/failure parity

Status: Verified
Requirements / acceptance: R5–R7; AC5 (browser/REPL portion), AC6 (REPL regression portion). Quantitative rendered acceptance remains Step 3.1.
Depends on: Step 2.2.
Review boundary: Single-textarea authored input, independent existing renderers, no `.shdr.ts` import fetch or extra bindings.

Expected files:

- `apps/repl/verify-browser.mjs` — extend existing Chromium checks for valid/invalid derivative edits and preserved previews; `apps/repl/src/use-shader-previews.ts`, `apps/repl/src/App.tsx` **only if existing consumer logic fails the added contract**.

Tasks:

- [x] Paste direct-imported derivative source in the single textarea; assert browser compilation produces both targets with no request for shader source modules.
- [x] Edit to wrong arity/shape or remove direct import, assert authored diagnostics and no usable candidate while the prior healthy WebGL/WebGPU preview remains installed.
- [x] Restore source and verify validation/render status recovers; distinguish shader diagnostics from unavailable/failed backend/device status.
- [x] Keep existing independent preview and texture/custom uniform tests intact; do not add host derivative options.

Verification:

- Automated, root, existing script **after extension**: `pnpm build`; `pnpm --filter repl exec node verify-browser.mjs`; `pnpm --filter repl check`. Assert real browser edit/recovery and request interception. This does not substitute for pinned non-square signed pixel probes in Step 3.1.
- Manual: Inspect screenshot/state only if scripted selectors cannot show which old preview survived; record both backend states, not a generic success banner.

Completion gate: Valid/invalid/restore sequences for wrong derivative arity and missing direct import hold on both browser preview paths with authored diagnostics and no shader-import fetch. Evidence: `apps/repl/verify-browser.mjs`; root build, `pnpm --filter repl exec node verify-browser.mjs`, and `pnpm --filter repl check` passed. The same script verifies both prior pixels remain unchanged after failure and both targets recover after restore.

Phase exit gate: Verified. Rebuilt package consumer suites passed (project 5, CLI 29, Vite 24 tests); installed VS Code fixture passed; vite-basic check/build plus dev, render and texture scripts passed; REPL browser compiler/runtime script and type/lint check passed. Derivative computation has not yet passed the signed/non-square quantitative rendering gate in Phase 3.

## Phase 3 — Rendered contract and final acceptance

Outcome: Real rendered behavior and regression evidence back every spec AC; docs state the limits honestly.
Depends on: Phase 2 exit.
Review boundary: Target-neutral signed Y and lane-wise width, final full-suite regression and documentation; reference shader **3** remains out of scope.

### Step 3.1 — Verify interior signed/width pixels on WebGL and presented WebGPU

Status: Pending
Requirements / acceptance: R2–R4, R8; AC2 and AC4 (rendered/pipeline portions), AC1 (target validation completion). No edge/quad-boundary or bit-exact claim.
Depends on: Phase 2 exit and Phase 0 recorded encoding/tolerances.
Review boundary: Real runtime pixels and capability characterization only; no new derivative semantics or engine-specific rewrites to chase pixels.

Expected files:

- **New** `packages/runtime/test/verify-fragment-derivatives.mjs` — use existing runtime Playwright/Vite dual-renderer patterns; `packages/runtime/package.json` — include the new script in existing `test` gate.
- `plans/fragment-derivatives/evidence/rendered-acceptance.md` — **only if useful**, record pinned dimensions/samples/encoding/tolerances, Chromium adapter and material observations.

Tasks:

- [ ] Compile authored source/artifact and **link** generated GLSL; validate WGSL module/**pipeline** and draw to a presented WebGPU canvas, not just an offscreen buffer or module-info probe.
- [ ] Use a non-square pinned canvas and stable interior coordinates/finite values. Encode and sample `dFdx(coord.x) ≈ +1`, `dFdy(coord.y) ≈ +1`, `dFdy(resolution.y - coord.y) ≈ -1`, and `fwidth(coord.y) ≈ 1` on **both** targets; detect missing/double GLSL negation.
- [ ] Probe distinct-lane scalar/Vec2/3/4 smooth slopes and a reachable imported helper; encode component-wise widths/signs into byte channels across passes so x-only checks cannot mask lane bugs. Compare each target to expected tolerances and record target-to-target differences separately.
- [ ] Verify pixel/readback origin, visible presented canvas capture and renderer success/error status; explicitly exclude discontinuities, borders, coarse/fine precision and unsupported adapters from portable-value assertions.

Verification:

- Automated, root, **after adding script**: `pnpm build`; `pnpm --filter @shdr/runtime exec node test/verify-fragment-derivatives.mjs`; `pnpm --filter @shdr/runtime check`. Expect GLSL link, WGSL pipeline, presented-WebGPU/WebGL interior pixels with predeclared tolerance and an actual observed sign distinction. On unavailable WebGPU/WebGL, fail/block, never silently skip.
- Manual: Review labeled sample coordinates, target identity (SwiftShader vs hardware), tolerances and presented canvas evidence; generated text or offscreen-only WGSL is insufficient.

Completion gate: All required rendered probes pass and evidence documents environment/limits, or remain Blocked with no AC2/AC4 claim. Evidence: Not run.

### Step 3.2 — Document and run final integration/regression gate

Status: Pending
Requirements / acceptance: R1–R8; AC3/AC5 (final regressions), AC6 (complete artifact/static/runtime compatibility); AC1–AC4 compose from prior owning gates.
Depends on: Step 3.1.
Review boundary: Docs, compatibility review and whole-feature proof; no source fidelity claim for reference shader **3**.

Expected files:

- `README.md`, `packages/shdr/README.md` and/or `apps/vite-basic/README.md` — update only the existing authoring/target sections affected; use direct-import examples, top-left Y, limits and helper behavior.
- `plans/fragment-derivatives/plan.md` — concise step/phase gate outcomes and links to meaningful evidence, not command logs.
- Existing affected tests/fixtures **only** for evidenced regressions, with focused reruns before the final gate.

Tasks:

- [ ] Document the exact accepted scalar/vector signatures, signed-Y behavior and GLSL output adjustment, fragment-only straight-line/helper scope, and exclusions (coarse/fine, matrix, control flow and reference shader 3).
- [ ] Run the whole repository regression and installed VS Code gate against the final revision; distinguish any pre-existing baseline failure from a derivative regression and record skipped/blocked target gates explicitly.
- [ ] Inspect JSON artifact shape, static production bundle/sourcemaps, old renderer cases and failed-edit recovery; no extra bindings or compiler/source evaluation in static output.
- [ ] Review AC1–AC6 evidence and surviving feature diff, including all proposed fixtures/tests and source locations, before requesting a feature-complete PR review; publication/merge is not implied.

Verification:

- Automated, root, existing: `pnpm build`; `pnpm ci:check`; `pnpm test`; `pnpm --filter @shdr/editor-fixture test:editor`; `pnpm --filter @shdr/runtime exec node test/verify-fragment-derivatives.mjs`; `git diff --check`. If `pnpm test` would install a browser without approval, run equivalent installed-browser package commands and **record the skipped aggregate as not passed**, not a green whole-suite claim.
- Manual: Review target captures, real editor failure/restore, bundle source-map exclusions, and docs against the signed-Y spec; verify reference shader **3** was not silently included. Do not assert publication or broad GPU fidelity.

Completion gate: All AC owners below have passing checks at the final revision, review complete, and any unavailable mandatory target/editor remains **Blocked**, not marked Verified. Evidence: Not run.

Phase exit gate: After Step 3.2 checks, review full diff and the gate evidence once: exact public/types/diagnostics, static isolation, both target compilers and real rendered interior WebGL/**presented** WebGPU, old regressions. Only then mark implementation verified; delivery still requires separate approval. Evidence: Not run.

## Final acceptance

| Spec AC | Owning step / gate                   | Required proof (not a duplicate progress checklist)                                                          | Evidence / status     |
| ------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------- |
| AC1     | Steps 1.1–1.2, 2.1; Phase 1 exit     | Twelve types/shapes, direct/imported helpers, real target link/pipeline, editor hovers                       | Owning gates; Not run |
| AC2     | Step 3.1                             | Non-square smooth interior signed X/Y, reconstructed Y and width on real WebGL + presented WebGPU            | Step 3.1; Not run     |
| AC3     | Steps 1.1–1.2, 2.1–2.2; Phase 3 exit | Wrong shapes/imports/captures map to original source with no candidate across core/editor/CLI                | Owning gates; Not run |
| AC4     | Steps 0.2, 1.2, 3.1                  | Raw feasibility followed by generated imported-helper/lane-wise target pipeline and rendered pixels          | Step 3.1; Not run     |
| AC5     | Steps 2.1–2.3; Phase 2 exit          | Valid/invalid helper edits in installed editor/project/CLI/Vite/REPL, preserved previews and no shader fetch | Owning gates; Not run |
| AC6     | Steps 1.2, 2.2, 3.2; Phase 3 exit    | Artifact/binding, static-bundle exclusion and existing runtime regression                                    | Owning gates; Not run |

## Rollback and recovery

The new builtin is one public/core/backend/consumer feature. Do not revert only public overloads or one emitter and leave accepted sources silently broken on another target; revert the feature-complete PR as a unit. Phase 0 standalone probes can remain as characterization independently if they do not activate calls. No data migration, irreversible operation, deployment or automatic publish is planned. On a failed edit/target test, preserve the last known healthy renderer state where supported, repair the candidate, then rerun the focused owner gate and dependent phase gates; a target outage is a blocker rather than a successful recovery.

## Deferred checks and accepted deviations

- None accepted. Hardware-wide derivative quad selection, discontinuity/edge parity, divergent control flow, additional stages, coarse/fine modes, and porting reference shader **3** remain outside the governing spec.
- Browser/editor unavailability is **not** an implicit waiver. Report the blocked AC and prerequisite; a requested deviation requires explicit owner approval, rationale and follow-up, not a fabricated passing gate.
