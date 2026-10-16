# Orbit/trigonometry semantics implementation plan

## Status and governing source

- Governing spec: [spec.md](spec.md), **implemented and verified** after the binary `atan` comparison decision.
- Delivery state: **Phase 3 complete**. Phases 1–2, rendered parity, documentation, and the broad regression audit are verified.
- Acceptance/release boundary: No implementation gates remain; no publication or deployment is included.
- Blockers: None. Binary `atan` axes, signed zero, branch-cut behavior, and numerical-domain limits are bounded by the resolved portable contract.

Step statuses below are the authoritative execution record. A phase is complete only when its step completion gates and phase exit gate are satisfied. Task checkboxes do not prove a gate passed. `Verified` means the scoped gate and required implementation review passed, not user approval or release. In supervised execution, record manual approvals in extension state rather than duplicating them in task checkboxes.

## Execution constraints

- All project paths and commands are relative to the repository root unless otherwise stated. Preserve unrelated worktree changes; inspect status before execution. Expected file lists describe scope, not permission to rewrite neighboring code.
- Preserve stable step IDs and the governing contract. Do not broaden signatures, normalize invalid inputs, or silently weaken portability requirements to make a backend compile.
- Keep this document a compact progress index. Each evidence entry should contain a brief outcome, material limitations, and an optional relative evidence link. Create supporting notes only when the results justify them; do not create empty evidence files during planning.
- Prerequisites: Node.js 24+, pnpm 11.23.0, the existing installed workspace dependencies, and Chromium/WebGL 2/WebGPU access for target gates. Dependency installation is not part of this plan. Existing package `pretest` hooks can run `playwright install chromium`; use direct `exec vitest`/`exec node` commands with an already installed browser where machine changes are not permitted. Otherwise report the missing prerequisite as **Blocked**, not passed.
- Root `pnpm build` uses Turbo dependency order. Focused `--filter` tests/checks do not automatically rebuild every dependency: rebuild changed prerequisites before testing consumers that resolve package `dist` exports. `shdr check` uses the built CLI, not a source entry.
- No current green baseline is assumed. Historical completed-plan results are not evidence for the current revision. Separate pre-existing failures from regressions; an existing failure is not an automatic waiver.
- New test files, scripts, and fixtures named below are **proposed additions**. Their commands become runnable only after the owning step adds them. Existing seams include the PR 3/mixed-shape target and editor suites, the runtime math script, and Vite/REPL verification scripts.
- Browser characterization can use existing SwiftShader flags (`--enable-webgl`, `--enable-unsafe-swiftshader`, `--enable-unsafe-webgpu`, `--use-angle=swiftshader`). Record browser/adapter information and whether hardware or software rendering was used; do not claim hardware-wide parity or timing from these observations.

## Phase overview and delivery boundary

| Phase | Outcome                                                                           | Dependencies                                 | Exit gate                                                                |
| ----- | --------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| 0     | Reproducible baseline, raw-target feasibility, and resolved numeric/axis contract | Existing workspace and browser prerequisites | Characterization evidence reviewed; spec axis/domain decision recorded   |
| 1     | All 31 signatures work through public types, core semantics, and both generators  | Phase 0 exit                                 | Complete signature/domain matrix and real generated-target compilation   |
| 2     | Editor, CLI, Vite, and REPL expose the same behavior                              | Phase 1 exit                                 | Consumer composition, edit/failure recovery, and static bundle isolation |
| 3     | Rendered parity evidence, accurate documentation, and final regression review     | Phase 2 exit                                 | Every spec AC owned and satisfied, or explicitly blocked/deviated        |

Delivery boundary: **one feature-complete PR**. Reviewable steps are not independent feature-release promises; do not merge a types-only or one-backend feature.

Atomic groups: Each Phase 1 step must include its public exports, registry/signature rule, exhaustive constant/generator consumers, relevant helper collection, and focused tests together. Never leave a newly accepted builtin with an unimplemented emitter or permissive overload. Phase 2's fixture imports and test consumers change together. All feature steps land/revert as one delivery unit if reverting the completed PR.

## Phase 0 — Baseline, feasibility, and numeric decision gate

Outcome: An honest starting point and an evidence-informed contract before production builtin implementation.
Depends on: Execution prerequisites above.
Review boundary: Characterization tests, numeric/rendered comparison apparatus, and contract documentation only; no public builtin activation.

### Step 0.1 — Establish the current baseline

Status: Verified
Requirements / acceptance: R8, R9; AC9 (baseline characterization only; feature compatibility belongs to Steps 1.1–3.2).
Depends on: None.
Review boundary: Read-only baseline plus concise evidence; prerequisite fixes require their own reviewed scope.

Expected files:

- `plans/orbit-trigonometry/plan.md` — brief status/evidence update.
- `plans/orbit-trigonometry/evidence/phase-0.md` — add only when recording meaningful environment, baseline, and characterization results for Phase 0.

Tasks:

- [x] Inspect current status, runtime/tool versions, package scripts, and browser availability without installing dependencies or altering unrelated files.
- [x] Build the existing workspace and run the focused current public/core/editor checks below; distinguish source tests from tests consuming built exports.
- [x] Record failures and capability gaps with the revision/environment. Do not attribute a baseline failure to PR 7 or silently repair it inside the feature.

Verification:

- Automated, root: `pnpm build`; `pnpm --filter shdr check`; `pnpm --filter @shdr/core check`; `pnpm --filter @shdr/language-service check`.
- Automated, root: `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/pr3-parity.test.ts test/pr3-target-feasibility.test.ts test/mixed-shape-clamp-pow.test.ts test/mixed-shape-clamp-pow-generated.test.ts`; `pnpm --filter @shdr/language-service exec vitest run --config ../../vitest.config.ts --root . test/pr3-editor.test.ts test/mixed-shape-editor.test.ts`.
- Manual: Inspect reported target availability and failures. Expected outcome is a reproducible baseline classification, not a fabricated all-green claim. Missing required browser capabilities block target-dependent work.

Completion gate: Baseline commands, revision, actual browser capabilities, and any failures are recorded; unresolved prerequisite failures are explicitly triaged before proceeding.
Evidence: [phase-0.md](evidence/phase-0.md).

### Step 0.2 — Characterize all raw-target signatures and constant evaluation

Status: Verified
Requirements / acceptance: R1, R2, R4, R6; AC1 (raw-shape feasibility), AC3 (endpoint target feasibility), AC4/AC7 (raw-target portions). Generated-source and public/tooling proof remain in later phases.
Depends on: Step 0.1.
Review boundary: Raw GLSL/WGSL probes only; no authored-language acceptance changes.

Expected files:

- `packages/core/test/orbit-target-feasibility.test.ts` — add raw-target probes using the existing Playwright/Vitest pattern.
- `plans/orbit-trigonometry/evidence/phase-0.md` — extend with material feasibility findings.

Tasks:

- [x] Probe the 31 agreed shapes, using native unary names and binary GLSL `atan(y, x)`/WGSL `atan2(y, x)`. Observe native mixed `mod` acceptance separately from Shdr's proposed explicit splat/formula lowering.
- [x] Compare GLSL `mod` and explicit floor-based candidates on both targets with negative operands, negative divisors, exact multiples, and non-uniform vectors. Characterize small divisors and extreme intermediates without adding unsupported precision promises.
- [x] Probe valid constant endpoints/conversions and direct versus parameterized domain-sensitive calls, including inputs unknown to conservative Shdr analysis and known non-finite compound arguments. Determine which helpers or source diagnoses are necessary; a parameter helper cannot hide an already overflowing constant argument.
- [x] Keep deliberately invalid/native-undefined cases separate from valid-case assertions. Record the tested emission strategies and numerical limitations; stop for contract review if no strategy satisfies shared source acceptance.

Verification:

- Automated, after adding the test, root: `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-target-feasibility.test.ts`; `pnpm --filter @shdr/core check`.
- Assertions: every valid raw shape compiles with a documented strategy on both targets; expected invalid/eager-constant behavior is labeled rather than mistaken for accepted runtime semantics. Module acceptance alone is not pixel evidence.
- Manual: Review feasibility findings for the conservative f32 diagnostic policy and ordinary finite input limits. No approval of a wider signature family is implied by native support.

Completion gate: Raw acceptance/constant-evaluation findings identify viable implementations for the agreed shapes and any blocking numerical issue is raised, not hidden in target-specific behavior.
Evidence: [phase-0.md](evidence/phase-0.md).

### Step 0.3 — Compare binary `atan` candidates and settle the contract

Status: Verified
Requirements / acceptance: R3, R9; AC5 (complete comparison/decision), AC6 (raw candidate evidence only; authored-output acceptance remains Step 3.1).
Depends on: Steps 0.1 and 0.2.
Review boundary: Native-versus-guarded numerical and visible comparison, followed by an explicit contract decision; no production emitter choice before that decision.

Expected files:

- `packages/core/test/orbit-atan-comparison.test.ts` — add browser comparison of raw fragment candidates.
- `packages/core/test/fixtures/orbit-atan-comparison/` — add raw shader/visual fixtures only if the test benefits from separate files.
- `plans/orbit-trigonometry/evidence/atan-comparison.md` — add the meaningful decision report with numeric findings and representative visual evidence links.
- `plans/orbit-trigonometry/spec.md` — record the resolved axis/domain behavior and readiness after review; preserve requirement/AC IDs.

Tasks:

- [x] Compare native forwarding against the spec's explicit-axis candidate on both fragment targets, across all quadrants, exact/near axes, signed zero, tiny inputs, the negative-axis branch cut, and exploratory origin behavior. Cover mixed lanes as well as scalar cases.
- [x] Supply dynamic inputs as f32 bit patterns where necessary so signed zero/subnormals are not lost through JSON serialization or constant folding. Validate probe transport/readback against known values before trusting angle results.
- [x] Obtain numeric fragment-stage results beyond coarse screenshot colors, for example verified float-target readback or lossless float-bit encoding into byte outputs. Record capability requirements and measurement limitations; compute-only output cannot establish fragment-stage behavior.
- [x] Render native and guarded angle/hue fields side by side on both targets, including a **presented WebGPU** canvas capture. Compare directions modulo a full turn at the branch cut; distinguish an intentional angle representation jump from a visible hue seam.
- [x] Separate guarantees in the applicable language specifications from observations, and document generated-code complexity. Investigate performance only if evidence warrants it; shader size is not a measured execution cost.
- [x] Recommend native forwarding, explicit handling, or a restricted domain. Record axes/signed-zero/branch-cut behavior, origin policy/diagnostics, small-input limits, and tolerance rationale in the report; native forwarding was selected with degenerate edge values outside the portable guarantee.

Verification:

- Automated, after adding the test, root: `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-atan-comparison.test.ts`; `pnpm --filter @shdr/core check`.
- Assertions: probe transport preserves the intended f32 cases; both candidates compile/draw; ordinary quadrant cases detect swapped arguments/lost quadrant information; exploratory undefined cases produce observations, not portable-value assertions. Availability failures must fail/block, not silently skip.
- Manual: With both browser targets available, inspect labeled candidate captures and numeric findings, then review the recommendation. Expected outcome is an explicit documented contract or an identified unresolved tradeoff. Preserve a rerunnable test and capture procedure in the evidence note; do not create a new permanent comparison app unnecessarily.

Completion gate: The report and spec agree on an evidence-informed contract. Any user-significant tradeoff is resolved before marking this step Verified. If unresolved or a target is unavailable, keep this gate blocked and do not start Phase 1.
Evidence: [atan-comparison.md](evidence/atan-comparison.md).

Phase exit gate: After Step 0.3's checks, rerun the two proposed Phase 0 core tests together plus the focused baseline core suites and `pnpm --filter @shdr/core check`. Review the evidence against the spec: all 31 shapes have a viable strategy; no backend-only acceptance conflict is hidden; numeric/axis decisions and tolerances are explicit; the spec was Ready for planning before activating production semantics; production semantics are now active and verified. Assess this gate before advancing or requesting supervised approval. Supporting evidence belongs in the Phase 0/atan notes, not duplicated transcripts here.
Evidence: Passed with 6 files / 78 tests; see [phase-0.md](evidence/phase-0.md) and [atan-comparison.md](evidence/atan-comparison.md).

## Phase 1 — Complete public/core/backend builtin slices

Outcome: All 31 signatures compile from one target-neutral meaning with correct domains and both generators.
Depends on: Phase 0 exit. **Do not execute while the numeric/axis contract is unresolved.**
Review boundary: Public authoring, core semantics and generated targets; dedicated editor/app acceptance follows Phase 2. Each step remains buildable and includes its own proof.

### Step 1.1 — Add unary inverse trig and angle conversions end to end

Status: Verified
Requirements / acceptance: R1, R2, R5, R6, R8; AC1/AC2/AC3/AC7 (public/core/generated unary portions), AC9 (compatibility portion). Tooling and presented pixels remain Phases 2–3.
Depends on: Phase 0 exit.
Review boundary: Twenty unary signatures: `asin`, `acos`, unary `atan`, `radians`, and `degrees`.

Expected files:

- `packages/shdr/src/{math,index}.ts`, `packages/shdr/test/index.test.ts`; new `packages/shdr/test/orbit-types.ts` — concrete overloads/exports, compile-only markers, shape assertions.
- `packages/core/src/{shader-builtin,lower-shader-syntax,evaluate-shader-constant}.ts` — vocabulary, unary signatures, conservative f32 domains.
- `packages/core/src/generate-{glsl,wgsl}-expression.ts`, `packages/core/src/generate-wgsl-fragment.ts` — spellings and any Phase 0-proven parameter-helper needs. The brace notation here identifies existing files, not shell commands.
- New `packages/core/test/{orbit-math,orbit-generated}.test.ts` — shared shape/domain and real generated-target checks, extended by Steps 1.2–1.3.

Tasks:

- [x] Add only concrete S/V2/V3/V4 overloads for these five names and compile-only runtime markers. Preserve rejected names/forms and existing exports.
- [x] Extend core vocabulary and every exhaustive consumer together. Keep unary `atan`'s signature rule extensible for the later agreed binary arity without admitting that arity prematurely.
- [x] Enforce `asin`/`acos` bounds after f32 rounding, known non-finite compound arguments, and any conservative overflow policy justified in Phase 0. Keep unknown lanes unknown and helper parameters dynamic; avoid JS transcendental approximation as proof.
- [x] Emit both targets and the parameterized helpers established by Phase 0 where needed. Aggregate helper requirements from reusable functions as well as entry statements, deduplicate declarations, and preserve grouping/names.
- [x] Add public result-type/negative tests, runtime-marker assertions, original-call diagnostic cases, endpoint and partially known vector cases, nested/helper use, and actual generated-target compilation for all twenty shapes.

Verification:

- Automated, root: `pnpm --filter shdr check`; `pnpm --filter shdr test`; `pnpm --filter @shdr/core check`; `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-math.test.ts test/orbit-generated.test.ts test/pr3-parity.test.ts test/readable-grouping.test.ts test/reusable-local.test.ts`.
- Rebuild `shdr` before checks consuming its declaration exports; then `pnpm build` as this step's public/core composition gate. Generated tests must use valid domain inputs, assert both target compilers accept output, and test no leaked helper-name cascades in source diagnostics.
- Manual: Review the twenty-signature matrix and non-goals against the spec. Mathematical expectations may use host reference calculations with tolerances, not an assertion of bit-identical target constants.

Completion gate: Twenty new unary signatures and their invalid forms agree across public/core/generated targets; touched code builds and old supported behavior stays usable. This does not yet claim editor/CLI or presented-pixel acceptance.
Evidence: [phase-1.md](evidence/phase-1.md).

### Step 1.2 — Add floor-based `mod` and divisor broadcasting

Status: Verified
Requirements / acceptance: R1, R4, R5, R6, R8; AC1/AC2/AC4/AC7 (public/core/generated `mod` portions), AC9 (composition portion). Rendered parity remains Step 3.1.
Depends on: Step 1.1.
Review boundary: Seven `mod` signatures and only their call-boundary broadcasting/helper infrastructure.

Expected files:

- `packages/shdr/src/{math,index}.ts`, `packages/shdr/test/{orbit-types.ts,index.test.ts}` — new `mod` boundary and marker coverage.
- `packages/core/src/{shader-builtin,lower-shader-syntax,evaluate-shader-constant}.ts` — dedicated rule, divisor/component checks, conservative evaluation.
- `packages/core/src/generate-{glsl,wgsl}-{expression,fragment}.ts` — tested lowering strategy and any required generated helper collection.
- `packages/core/test/{orbit-math,orbit-generated}.test.ts` — signed values, shapes, helper aggregation and target compilation.

Tasks:

- [x] Add S/S, V/V, and V/S forms; reject S/V and mismatched dimensions without broadening unrelated rules. Retain scalar divisors in authored call IR.
- [x] Diagnose known zero divisors, including `-0`, a divisor rounding to zero, and known-bad lanes beside unknown ones. Apply the Phase 0 non-finite/intermediate policy conservatively; do not pretend all finite inputs have finite intermediates.
- [x] Implement the Phase 0-validated floor-based strategy, using parameter boundaries so emitted arguments are not repeated. Apply explicit scalar-to-vector expansion only where needed for this call.
- [x] If internal helpers are needed, collect requirements from entry and reusable helper bodies in **both** emitters, emit each signature once in dependency-safe order, and leave artifacts/bindings unchanged. The GLSL helper-body path now aggregates requirements alongside WGSL.
- [x] Extend shape/domain/generated tests for signed examples, non-uniform vector lanes, exact multiples, nested/helper calls and one-evaluation text structure; add regressions for existing broadcast rules and generated-name/grouping safety.

Verification:

- Automated, root: `pnpm --filter shdr check`; `pnpm --filter shdr test`; `pnpm --filter @shdr/core check`; `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-math.test.ts test/orbit-generated.test.ts test/mixed-shape-clamp-pow.test.ts test/mixed-shape-clamp-pow-generated.test.ts test/readable-local-names.test.ts test/readable-grouping.test.ts`.
- Rebuild changed public/core exports before consumer verification. Assertions must demonstrate authored scalar divisor IR, explicit target expansion where required, a single emitted argument occurrence at the call boundary, correct helper reachability, and no new overloads for unrelated math.
- Manual: Inspect signed-result examples and floor-based lowering against the spec and Phase 0 decision; do not substitute `%` based on positive-only tests.

Completion gate: All seven forms and zero-divisor failures agree through public/core/generated paths; actual target compilation succeeds and reusable-helper requirements are not dropped.
Evidence: Verified; see [phase-1.md](evidence/phase-1.md).

### Step 1.3 — Add binary `atan` under the resolved axis contract

Status: Verified
Requirements / acceptance: R1, R3, R5, R6, R8; AC1/AC2/AC7 (binary/public/core/generated portions), AC5 (decision faithfully implemented), AC9 (composition portion). Final browser acceptance remains Phase 3.
Depends on: Step 1.2 and the recorded Step 0.3 decision.
Review boundary: Four binary same-shape signatures; no mixed-shape convenience or public `atan2` alias.

Expected files:

- `packages/shdr/src/math.ts`, `packages/shdr/test/{orbit-types.ts,index.test.ts}` — four added overloads and assertions beside unary `atan`.
- `packages/core/src/{shader-builtin,lower-shader-syntax,evaluate-shader-constant}.ts` — arity-specific same-shape rule and resolved domain policy.
- `packages/core/src/generate-{glsl,wgsl}-{expression,fragment}.ts` — arity-sensitive mapping and any selected axis helper emission.
- `packages/core/test/{orbit-math,orbit-generated}.test.ts` — final 31-shape matrix and decided boundary behavior.

Tasks:

- [x] Admit unary or exactly two same-shape arguments and preserve `(y, x)` in typed IR. Unary mapping remains native `atan` on both targets; binary WGSL maps to `atan2` while GLSL forwards `atan(y, x)`.
- [x] Implement only the chosen axes/signed-zero/branch-cut policy, scalar and lane-wise. Binary `atan` adds no invented fallback or extra restriction; exact degenerate cases remain caller preconditions as selected in Step 0.3. Known non-finite arguments use the shared domain diagnostic.
- [x] Integrate the native target mappings without internal helpers or artifact changes; reusable helper calls preserve the same arity-sensitive mapping.
- [x] Complete public/core/generated tests for all 31 signatures, negative shape/arity cases, helper calls, non-finite compounds and conservative dynamic-parameter behavior. Validate actual generated output and WebGL/WebGPU shader-module compilation.

Verification:

- Automated, root: `pnpm --filter shdr check`; `pnpm --filter shdr test`; `pnpm --filter @shdr/core check`; `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-math.test.ts test/orbit-generated.test.ts test/orbit-atan-comparison.test.ts test/pr3-parity.test.ts test/reusable-local.test.ts test/reusable-graph.test.ts`.
- Assertions: precisely 31 new shapes, arity-specific mapping, quadrant correctness, decided axis/domain behavior, no binary signature leaking into rejected mixed forms, and successful real shader/module compilation.
- Manual: Review generated binary handling against the recorded decision; selected native/guarded behavior cannot be inferred solely from a passing ordinary quadrant case.

Completion gate: All 31 forms and finalized domain rules are implemented on both targets, including nested/helper usage, without breaking unary or old math behavior.
Evidence: Verified; see [phase-1.md](evidence/phase-1.md).

Phase exit gate: After Step 1.3's focused checks, run `pnpm build`, `pnpm --filter shdr check`, `pnpm --filter shdr test`, `pnpm --filter @shdr/core check`, and `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root .`. Review the shape inventory, diagnostic ranges, helper collection and raw/generated target distinction together. No editor/app or presented-pixel claim is made yet. Assess before Phase 2 or supervised approval.
Evidence: Verified; 51 core files / 489 tests passed after the Step 1.3 changes; see [phase-1.md](evidence/phase-1.md).

## Phase 2 — Shared tooling and consumer integration

Outcome: The same contract reaches authored checking, mapped editor feedback, static imports, and browser edits.
Depends on: Phase 1 exit and freshly built package exports.
Review boundary: Existing tooling paths and focused fixtures; no editor transport migration or runtime API changes.

### Step 2.1 — Verify TypeScript 7/editor and CLI parity

Status: Verified
Requirements / acceptance: R1, R5, R7, R8; AC1/AC2/AC3/AC7 (editor/CLI portions), AC8 (editor/CLI portions; app paths remain Step 2.2).
Depends on: Phase 1 exit.
Review boundary: Mapped diagnostics, hovers, unsaved edits, and the built CLI in isolated temporary projects.

Expected files:

- New `packages/language-service/test/orbit-editor.test.ts` — concrete hovers, mapped failures, helper/edit coverage using the existing fixture project/adapter.
- `packages/cli/test/cli.test.ts` and, if useful, new `packages/cli/test/fixtures/orbit-*.shdr.ts` — executable/core parity through disposable projects.
- `packages/language-service/src/typescript-7-{checker,editor-adapter}.ts` or core virtual-source code — only if tests expose a real integration gap; no speculative adapter rewrite.

Tasks:

- [x] Exercise all 31 editor call/result shapes plus representative local/imported helper definitions and call sites. Check concrete QuickInfo rather than accepting a widened union or generic fallback.
- [x] Compare core and mapped editor diagnostics for wrong shapes, invalid domains, f32 endpoints, partially known lanes and the finalized binary domain. Assert original authored file/range and absence of generated-helper cascades.
- [x] Edit valid source to invalid and back, including a helper document, and assert hovers/diagnostics refresh. Preserve ordinary `.ts` diagnostic ownership using the existing routing tests.
- [x] Add CLI checks for valid fragment/helper graphs and invalid signature/domain calls, using its existing temporary-project fixture pattern. Verify built executable exit codes and original file/line attribution, then remove only the test-owned temporary directories.

Verification:

- Automated, root, after prerequisite builds: `pnpm --filter @shdr/language-service check`; `pnpm --filter @shdr/language-service exec vitest run --config ../../vitest.config.ts --root . test/orbit-editor.test.ts test/diagnostic-routing.test.ts test/mixed-shape-editor.test.ts test/reusable-local-editor.test.ts`.
- Automated, root: `pnpm --filter @shdr/cli build`; `pnpm --filter @shdr/cli check`; `pnpm --filter @shdr/cli exec vitest run --config ../../vitest.config.ts --root . test/cli.test.ts`.
- Manual: Not required for the adapter/CLI scope when those gates pass. Actual VS Code/Zed UI acceptance is not established by an adapter test and is not a required transport project here.

Completion gate: Core, TypeScript 7 editor and CLI agree on the new boundary, original locations, and edit refresh; ordinary TypeScript remains unaffected.
Evidence: Verified; see [phase-2.md](evidence/phase-2.md).

### Step 2.2 — Exercise static Vite and browser/REPL paths

Status: Verified
Requirements / acceptance: R6, R7, R8, R9; AC8 (app paths), AC9 (static artifact boundary). Detailed numerical rendered acceptance remains Step 3.1.
Depends on: Step 2.1.
Review boundary: A focused orbit-math example and existing integration verifiers, not a new reference port or REPL interface.

Expected files:

- New `apps/vite-basic/src/orbit-math.shdr.ts`; `apps/vite-basic/src/main.ts` — statically consume a finite illustrative shader with the six names.
- `apps/vite-basic/src/webgl-only.ts`, `apps/vite-basic/{verify-build,verify-dev,verify-render}.mjs` — ensure the feature participates in static/runtime-only bundle checks and existing dev/render verification.
- `apps/repl/verify-browser.mjs` — browser compiler input, both targets, bad-edit retention and correction coverage.

Tasks:

- [x] Add a bounded finite `orbit-math.shdr.ts` shader with observable inverse trig, both `atan` arities, angle conversions, and signed floor-based wrapping. Dynamic values stay inside the finalized domain.
- [x] Import/use the artifact in the existing Vite fixture and WebGL-only consumer. Extend dev/production assertions for `atan2`, modulo helpers, source-map ownership, and compiler/runtime bundle isolation.
- [x] Exercise browser compilation through the existing single-textarea REPL with an in-text binary-`atan` helper. Both previews render; an invalid mixed-shape edit blocks both targets while retaining both previous frames, then the valid source recovers.
- [x] Keep dev verification edits temporary and restore original fixture contents in `finally`; no runtime bindings, lifecycle, or host inputs changed.

Verification:

- Automated, root, with updated package exports: `pnpm --filter vite-basic build`; `pnpm --filter vite-basic check`; `pnpm --filter vite-basic exec node verify-dev.mjs`; `pnpm --filter vite-basic exec node verify-render.mjs`.
- Automated, root: `pnpm --filter repl build`; `pnpm --filter repl check`; `pnpm --filter repl exec node verify-browser.mjs`.
- Expected results: static dual-target and WebGL-only consumers exclude parser/compiler/DSL execution; browser compiler/editor paths accept the same valid fixture and reject bad edits without partial render replacement. Existing WebGL-only fallback assertions remain intact.
- Manual: Not needed if browser verifiers exercise these flows; missing WebGPU may preserve a valid product fallback but still blocks the required two-target acceptance gate.

Completion gate: New builtin use is exercised in actual static and dynamic consumer paths, including failure recovery and compiler exclusion; fixture source restoration leaves no accidental worktree edits.
Evidence: Verified; see [phase-2.md](evidence/phase-2.md).

Phase exit gate: After Step 2.2's checks, rebuild changed dependencies, run `pnpm --filter @shdr/language-service test`, `pnpm --filter @shdr/cli test`, `pnpm --filter vite-basic test`, and `pnpm --filter repl test` subject to the browser-install constraint above. Confirm adapter, executable, static artifacts, browser compiler, and previous-frame retention compose without divergent rules. These existing scripts include builds/hooks as declared in their package manifests. Assess before Phase 3 or supervised approval.
Evidence: Verified; see [phase-2.md](evidence/phase-2.md).

## Phase 3 — Rendered acceptance and completion

Outcome: The actual generated operations have numerical/visible evidence, documentation matches delivery, and compatibility checks pass.
Depends on: Phase 2 exit.
Review boundary: Focused runtime evidence and documentation/regression review; no reference-port fidelity or publication.

### Step 3.1 — Pin generated WebGL/presented-WebGPU parity

Status: Verified
Requirements / acceptance: R2, R3, R4, R6, R8, R9; AC4/AC6 (generated numeric/rendered portions), AC9 (runtime composition portion).
Depends on: Phase 2 exit.
Review boundary: Runtime acceptance of generated artifacts, not another raw/native-only spike.

Expected files:

- New `packages/runtime/test/verify-orbit-math.mjs`; `packages/runtime/package.json` — focused browser verifier wired into the existing runtime test script atomically.
- `apps/vite-basic/src/orbit-math.shdr.ts` — reuse the Step 2.2 example where appropriate; additional cases may remain inline in the verifier.
- `packages/core/test/orbit-generated.test.ts` — extend fragment-stage numeric probes if higher-precision assertions belong in the existing Step 0.3 apparatus rather than duplicating it.
- `plans/orbit-trigonometry/evidence/rendered-parity.md` — add only to record substantive input/tolerance/environment results and material limitations.

Tasks:

- [x] Reuse `verify-pr3-math.mjs`'s Vite-served runtime pattern with deterministic 32×32 canvases, `animate: false`, top-left sample mapping, WebGL readback, and **presented WebGPU canvas screenshot** sampling.
- [x] Cover all six names and all result dimensions with distinct lane values. Signed `mod`, vector/scalar divisor broadcasting, unary-versus-binary `atan`, asymmetric quadrants, inverse-trig endpoints, and known angle conversions are observable in separate normalized cases.
- [x] Add near-axis and branch-cut approaches under the resolved contract and a valid custom-uniform update. Exact degenerate axes/origin are excluded from portable-value assertions.
- [x] Compare outputs against independent host references and each other with an explicit 8-channel-value tolerance. Conversion cases use known degree/radian values rather than round trips alone.
- [x] Check four non-center samples, initial and updated uniform draws, and backend errors. Record environment/capabilities and do not skip an unavailable required backend.

Verification:

- Automated, after adding/wiring the script, root: `pnpm --filter @shdr/runtime exec node test/verify-orbit-math.mjs`; `pnpm --filter @shdr/runtime check`; `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-generated.test.ts`.
- Assertions: mathematical correctness and paired target parity for generated artifacts, lane-sensitive broadcasting, selected axes, and persistent uniform updates. WGSL module success/readback from an offscreen texture alone is not presented-WebGPU evidence.
- Manual: Review the selected angle/hue captures when a seam or tolerance choice is consequential. Any tolerance increase must explain the numerical cause rather than masking swapped arguments, clamping, wrapping sign errors, or dropped vector lanes.

Completion gate: Generated WebGL and presented WebGPU evidence passes under explicit tolerances for the defined input contract; numeric observations support the precision-sensitive assertions, and the new script participates in regular runtime tests.
Evidence: Verified; see [rendered-parity.md](evidence/rendered-parity.md).

### Step 3.2 — Publish the accurate language contract and audit acceptance

Status: Verified
Requirements / acceptance: R1–R9; AC1–AC9 (final integration/documentation audit, not replacement for owning scoped proofs).
Depends on: Step 3.1.
Review boundary: Documentation, final regression verification, and evidence reconciliation only; no new language scope.

Expected files:

- `README.md`, `packages/shdr/README.md`, `plans/language-exntesion.md` — accepted signatures/domains, decided axes, and delivered status without completed-reference-port claims.
- `plans/orbit-trigonometry/{spec,plan}.md` — ensure the resolved contract, execution status and evidence links agree.
- `plans/orbit-trigonometry/evidence/completion.md` — add only if useful for exact broad-check revision/commands and material failures; do not duplicate scoped evidence or routine logs.

Tasks:

- [x] Document six names, 31 signatures, import conventions, signed floor-based `mod`, both `atan` arities, finalized axes/limits, f32 domain diagnostics and dynamic caller preconditions. Aggregate counts were recomputed against the current signature matrix.
- [x] Update PR 7 roadmap status to match the evidenced delivery and remaining acceptance work; `tan`, `%`, matrices, general broadcasting, reference-port fidelity, and unrelated extensions remain outside this delivery.
- [x] Audit every spec AC against the owning gate below, including source ranges, partial-known lanes, helpers, static consumer exclusion, editable-source recovery, and presented WebGPU evidence. The completion note records the reconciliation without replacing scoped proof.
- [x] Run the broad checks below, distinguish baseline limitations from regressions, and resolve failures. Chromium, WebGL 2, and presented WebGPU were available; no required capability was skipped.

Verification:

- Automated, root: `pnpm build`; `pnpm check`; `pnpm ci:check`; `pnpm test`; `pnpm exec prettier --check "**/*.{ts,tsx,md}"`; `git diff --check`. Existing broad test hooks may install Chromium; respect execution constraints and record any blocked hook/check instead of calling a partial run a full pass.
- Mathematical browser gates remain those from Step 3.1; bundle isolation remains Step 2.2. Broad tests must not replace their explicit results.
- Manual: Review the final diff and AC mapping against the resolved spec and exclusions. Confirm that unrelated worktree changes are untouched, evidence does not claim cross-hardware identity, and delivery status is not marked complete while required gates are blocked.

Completion gate: All required scoped and broad gates pass and implementation review is complete; documentation describes the shipped contract accurately. No gate was waived.
Evidence: [completion.md](evidence/completion.md)..

Phase exit gate: The final acceptance review reconciled the resolved spec, all step gates, rendered evidence, tooling composition, and broad compatibility gates. Implementation is verified; no release/publication authorization is implied.
Evidence: [completion.md](evidence/completion.md)..

## Final acceptance

This table maps proof ownership; it is not a second progress checklist. Follow each owning step's evidence entry for results.

| Spec acceptance ID | Owning step / gate                        | Verification and expected result                                                                                                                                   | Evidence / status                                                                                                                                                   |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1                | Steps 1.1–1.3; Step 2.1; Phase 1 exit     | Exactly 31 public/core/generated shapes with concrete editor results, including representative local/imported helpers.                                             | Verified — [Phase 1](#phase-1--complete-publiccorebackend-builtin-slices) and [Step 2.1](#step-21--verify-typescript-7editor-and-cli-parity) evidence entries       |
| AC2                | Steps 1.1–1.3 and 2.1                     | Rejected shape/arity/import forms retain specific original-source diagnostics and no permissive overload.                                                          | Verified — owning step evidence entries                                                                                                                             |
| AC3                | Steps 0.2, 1.1 and 2.1                    | Valid f32 endpoints compile; known invalid/partial-lane cases reject at the authored call, consistently with editor/core.                                          | Verified — owning step evidence entries                                                                                                                             |
| AC4                | Steps 0.2, 1.2 and 3.1                    | Signed floor-based results, divisor broadcasting and zero-divisor checks; generated numeric and rendered parity.                                                   | Verified — [Step 1.2](#step-12--add-floor-based-mod-and-divisor-broadcasting) and [Step 3.1](#step-31--pin-generated-webglpresented-webgpu-parity) evidence entries |
| AC5                | Step 0.3; conformance in Step 1.3         | Native/guarded comparison and reviewed decision become the implemented axis/domain contract.                                                                       | Verified — [Step 0.3](#step-03--compare-binary-atan-candidates-and-settle-the-contract) evidence entry/report                                                       |
| AC6                | Step 3.1                                  | Actual generated WebGL and presented WebGPU finite outputs meet mathematical expectations/tolerances, including conversions, quadrants, selected axes and updates. | Verified — Step 3.1 evidence entry                                                                                                                                  |
| AC7                | Steps 0.2, 1.1–1.3 and 2.1                | Local domain rejection, unknown-helper preconditions and no WGSL-only constant-evaluation rejection under the shared policy.                                       | Verified — owning core/editor evidence entries and Phase 1 exit                                                                                                     |
| AC8                | Steps 2.1–2.2; Phase 2 exit               | Editor/CLI/Vite/browser agree; invalid edits preserve both previous valid previews and corrections recover.                                                        | Verified — [Phase 2](#phase-2--shared-tooling-and-consumer-integration) evidence entries                                                                            |
| AC9                | Steps 1.1–1.3, 2.2, 3.1–3.2; Phase 3 exit | Existing metadata, bindings, grouping, names and old forms remain correct; static consumers exclude compiler; documentation and broad checks match delivery.       | Verified — owning compatibility/bundle/runtime evidence and final review                                                                                            |

## Rollback and recovery

- Characterization tests and evidence in Phase 0 do not activate public builtins. They can be retained for decision review or reverted without changing existing shader behavior. Do not erase consequential failed evidence that explains a still-open contract issue.
- Within each Phase 1 slice, revert public signatures, registry/domain handling, exhaustive emitters/helper collectors, and dependent tests together. If undoing an earlier slice after later slices depend on it, revert dependents as well or use a complete feature revert; never leave accepted source without both emitters.
- Revert fixture imports and integration verifier changes together. Dev tests must restore only files they own from saved contents in `finally`; never use a global reset or delete unrelated work to recover a test.
- After partial build failure, correct the scoped issue and rebuild changed dependency exports before rerunning consumers; stale `dist` artifacts are not valid evidence. If the spike invalidates an assumption, stop affected implementation and update the spec through explicit review, not a target-specific fallback.
- There are no migrations, persistent data changes, irreversible operations, or release actions. A completed feature rollback includes the roadmap/language-reference changes and all dependent fixtures; preserve unrelated work.

## Deferred checks and accepted deviations

- **Accepted deviations: None.** All required checks were executed; no gate was waived.
- Binary `atan` uses native forwarding under the resolved portable-domain restrictions recorded in the spec and Step 0.3 evidence. This does not promise fallback pixels for origin, signed-zero-sensitive axes, or very small inputs.
- Full orbiting-circles fidelity, `tan`, unrelated signatures, matrices/captures, authored branching, interprocedural proofs and runtime API changes remain outside this plan per the spec.
- A real VS Code/Zed UI session, broad hardware-GPU matrix and performance benchmark are not required acceptance gates for this slice. The required TypeScript 7 adapter, Chromium WebGL and presented WebGPU gates remain mandatory; lack of those capabilities must be recorded as Blocked, not recast as deferred optional coverage.
