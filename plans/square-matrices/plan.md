# Square f32 matrices implementation plan

## Status and governing source

- Governing spec: [spec.md](spec.md), including its explicit scope and inferred defaults A1–A5. The spec, not the historical `mat2` roadmap, governs this work.
- Delivery state: **Implementation complete; final G3 closure is blocked** by the unrelated existing `vite-basic` presented-WebGPU regression recorded in `evidence/completion.md`.
- Acceptance or release still pending: G3 must be rerun after that regression is resolved. Publication/deployment is not part of this delivery.
- Blockers: No product decision blocks delivery. Node/pnpm and WebGL 2/WebGPU browser prerequisites are available; G3 is blocked by the existing `vite-basic` presented-WebGPU pixel regression recorded in `evidence/completion.md`.

Step statuses below are the authoritative execution record. A phase is complete only when its step completion gates and phase exit gate are satisfied. Task checkboxes do not prove those gates passed. `Verified` means scoped verification and implementation review passed, not manual approval or release. In supervised execution, record approvals in extension state, not plan checkboxes. Record a waiver as `Accepted deviation`, not `Verified`.

## Execution constraints

- Paths and commands are relative to the repository root `/Users/andy/Documents/Development/shader-dsl` unless stated otherwise. Preserve unrelated work, including the governing spec; expected files describe a bounded change surface, not permission to rewrite adjacent features.
- This plan authors no code and runs no planned verification automatically. Execution requires a separate instruction. Keep IDs stable and escalate contradictions with the spec instead of changing signatures, native-arithmetic restrictions, or runtime boundaries for convenience.
- Require Node >=24, the repository's pnpm toolchain, available workspace dependencies, and an already provisioned Playwright Chromium with WebGL 2/WebGPU support. Do not provision browsers, install dependencies, or change machine configuration implicitly. If a required capability is absent, record the affected gate as `Blocked` and request the prerequisite separately.
- Package exports resolve to `dist`, and consumer/editor tests use those exports. Refresh upstream builds before checking dependent packages; stale declarations are not valid parity evidence. Existing Turbo `build` dependency ordering can supply this: `pnpm exec turbo run build --filter=@shdr/cli --filter=@shdr/language-service --filter=@shdr/vite --filter=@shdr/runtime` builds those packages and their workspace build prerequisites.
- Focused Vitest commands use `pnpm --filter <package> exec vitest run --config ../../vitest.config.ts --root . <test paths>` from the root. This bypasses package `pretest` installers while running the actual suite. New test paths explicitly marked **new** below are not runnable until their owning step adds them. Type fixtures such as `packages/shdr/test/square-matrix-types.ts` are checked by `pnpm --filter shdr check`, not executed as shader JavaScript.
- Existing core/runtime/Vite/REPL package test scripts invoke `playwright install chromium` through lifecycle scripts. Final workspace orchestration must respect the provisioning constraint above; a missing prerequisite or unrun orchestration gate must remain explicit, not be hidden by passing focused tests.
- Browser checks use the existing Chromium/SwiftShader patterns, loopback servers, and cleanup in `finally`. Record actual software/hardware/browser conditions. Do not equate WGSL compilation with a presented WebGPU frame, or shared wrong pixels with mathematical correctness.
- No runtime matrix uploads, artifact-schema changes, new bindings, dependency additions, general GLSL parser, new editor transport, or reference-port work. Existing scalar/vector uniforms may supply matrix coefficients.
- Evidence entries stay brief: result, check/revision when useful, and limitations. Link supporting notes only for meaningful reproducibility; do not create empty evidence files or append command transcripts/debugging diaries.

## Phase overview and delivery boundary

| Phase | Outcome | Dependencies | Exit gate |
| --- | --- | --- | --- |
| 0 | Recorded baseline and feasible native-target/constructor strategy | Existing checkout/toolchain/browser prerequisites | G0: baseline classified; all intended raw target families compile |
| 1 | Public/core matrix values, operators, helpers, and both generated targets | G0 | G1: complete language slice passes types/core/real generated-target compilation |
| 2 | TypeScript 7 and consumer paths expose the same contract | G1 | G2: editor/CLI/Vite/browser/REPL parity and static isolation |
| 3 | Rendered mathematical acceptance, accurate docs, and regression closure | G2 | G3: pixels, compatibility, documentation, and workspace checks |

Delivery boundary: **one feature-complete PR/change set**, after G3. Phases/steps are review increments, not separately shippable support claims. Step 1.1 alone is constructor/local support; it is not the complete advertised feature.

Atomic groups: each step's public/core/generator changes and its corresponding tests must land/revert together. In particular, adding a matrix value kind cannot leave exhaustive generators, constant analysis, or builtin rejection on the old scalar/vector assumptions. The full feature remains the merge/release unit; do not merge types-only or single-backend support independently.

## Phase 0 — Baseline and target feasibility

Outcome: distinguish current failures from regressions and select an evidenced constructor spelling/single-evaluation strategy without altering the product contract.
Depends on: the execution prerequisites above.
Review boundary: read-only baseline plus isolated raw-target characterization tests; no production matrix implementation.

### Step 0.1 — Record baseline and execution prerequisites

Status: Verified
Requirements / acceptance: R5–R9; prerequisites for AC9–AC14, not acceptance of matrix behavior.
Depends on: None.
Review boundary: environment/baseline classification only; unrelated fixes require separately scoped review.

Expected files:

- `plans/square-matrices/plan.md` — concise result/blocked status.
- `plans/square-matrices/evidence/phase-0.md` — **new when evidence exists**; environment, material baseline failures, and Step 0.2 feasibility conclusions.

Tasks:

- [x] Record worktree state and relevant toolchain/browser versions and availability; preserve existing changes and separate pre-existing failures from this feature.
- [x] Refresh dependency builds with the scoped Turbo build command above. Check `shdr`, core, and language-service packages with their existing `check` scripts.
- [x] Run existing focused core and editor characterization suites below. Record browser availability distinctly from source/type results; do not infer a green workspace from focused coverage.

Verification:

- Automated: `pnpm --filter shdr check`, `pnpm --filter @shdr/core check`, and `pnpm --filter @shdr/language-service check` establish the current type baseline after dependency builds.
- Automated: `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/vector-arithmetic.test.ts test/math-builtin-parity.test.ts test/reusable-graph.test.ts test/grouping-render-parity.test.ts` characterizes old operator/helper semantics and the existing browser grouping path.
- Automated: `pnpm --filter @shdr/language-service exec vitest run --config ../../vitest.config.ts --root . test/constructor-parity.test.ts test/arithmetic-parity.test.ts test/reusable-local-editor.test.ts` characterizes existing TypeScript 7 parity.
- Manual: no visual judgment required; inspect the commands' capability reports and classify unavailable browser/native-TypeScript prerequisites rather than approving them by assumption.

Completion gate: all scoped baseline results are recorded with failures classified. An unexplained relevant failure or unavailable required browser blocks G0; a pre-existing failure is not automatically waived.
Evidence: `evidence/phase-0.md` (Step 0.1 result).

### Step 0.2 — Prove raw target acceptance and constructor strategy

Status: Verified
Requirements / acceptance: R2, R3, R5, R9; AC3/AC5 (raw orientation characterization) and AC11 (raw-target portion only; generated acceptance belongs to G1).
Depends on: Step 0.1.
Review boundary: raw GLSL/WGSL probes only, following existing `orbit-target-feasibility.test.ts` and `mixed-shape-clamp-pow-target-feasibility.test.ts` patterns; no new general-purpose browser framework.

Expected files:

- `packages/core/test/square-matrix-target-feasibility.test.ts` — **new**, raw target cases.
- `plans/square-matrices/evidence/phase-0.md` — concise accepted spelling, single-evaluation approach, environment, and any blocker.

Tasks:

- [x] Probe the 12 constructor and 21 binary signature families using explicit target types, constant inputs, and representative function-parameter/dynamic inputs at N=2/3/4.
- [x] Exercise matrix-valued locals and parameter/return boundaries in raw GLSL ES 3.00 and WGSL. Probe diagonal construction through a scalar parameter helper so one authored scalar occurrence need not be copied N times; check explicit coefficient/column and copy spellings rather than assuming compatibility.
- [x] Include asymmetric direction and noncommuting composition checks against independent small-number expectations, including the spec's 2x2 examples. Keep raw numeric orientation checks distinct from later generated/rendered acceptance.
- [x] Record the minimal successful lowering strategy and constant-evaluation observations. If the advertised ordinary finite cases cannot be supported within the spec, stop and surface the contradiction; do not add division/negation or alter constructors.

Verification:

- Automated, after adding the proposed test: `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/square-matrix-target-feasibility.test.ts`; all raw families compile on real WebGL 2/WebGPU and orientation observations match expectations.
- Automated: `pnpm --filter @shdr/core check` keeps the new browser test typechecked. Ensure missing WebGPU fails/reports unavailable rather than silently passing the required gate.
- Manual: review probe-to-spec coverage and the selected strategy; this is not proof that Shdr generates it yet.

Completion gate: raw feasibility and constructor single-evaluation strategy are evidenced for all sizes, with no unresolved scope-changing contradiction.
Evidence: `evidence/phase-0.md` (Step 0.2 result).

**Phase exit gate G0:** after Step 0.2's checks, review the classified Step 0.1 baseline and raw coverage together. Advance only with available required capabilities, an explained baseline, and a feasible dual-target strategy for the exact spec; assess this before requesting supervised approval to advance.
Status: Verified — baseline, browser capabilities, raw constructor/operator compilation, and asymmetric orientation checks passed.
Evidence: `evidence/phase-0.md`.

## Phase 1 — Public/core language and both targets

Outcome: the exact matrix language compiles end to end with strict failures and no scalar/vector regression.
Depends on: G0.
Review boundary: language, target generation, and focused proof; no consumer UI or full reference ports.

### Step 1.1 — Constructors and matrix value safety

Status: Verified
Requirements / acceptance: R1, R2, R5, R6, R8; AC1/AC2 (public/core/local-target portions), AC6 (access/builtin/unary rejection), AC10 (constructor/literal safety), AC11 (generated constructors). Helpers, editor, and pixels are owned by Steps 1.3, 2.1, and 3.1.
Depends on: G0.
Review boundary: four constructor families at all sizes and the atomic value-kind safety changes; matrix arithmetic remains explicitly rejected until Step 1.2. Core shape uses independent column/row counts from the outset, but rectangular source signatures and operator rules remain out of scope.

Expected files:

- `packages/shdr/src/{types,dsl,index}.ts`; `packages/shdr/test/{square-matrix-types.ts,index.test.ts}` — **new** type fixture, concrete brands/constructors/exports, compile-only marker assertions.
- `packages/core/src/{shader-type,shader-ir,index,browser,parse-shader-file,lower-shader-syntax,shader-builtin,evaluate-shader-constant}.ts` — shape/import/checking/analysis changes and affected type exports.
- `packages/core/src/generate-{glsl,wgsl}-{expression,fragment}.ts`, and `shader-local-name.ts` only if needed — type/constructor emission, internal helper bookkeeping and safe names.
- `packages/core/test/square-matrix-{shape,constructors,generated}.test.ts` — **new** focused shape/core/generated-target tests; affected existing exhaustive IR/type fixtures as required for buildability.

Tasks:

- [x] Add distinct public Mat2/3/4 f32 brands, finite concrete overloads, compile-only constructors, and exports. Typecheck accepted/rejected constructor forms and absence of matrix component access; invoking a marker must throw without executing authored callbacks.
- [x] Add an explicit core matrix kind with separate `columns` and `rows` counts and constructor/import recognition. Source acceptance requires equal counts in `2 | 3 | 4`; preserve public Mat2/3/4 types. Compare both counts in type equality and derive target type/constructor spelling from explicit shape. Format actual matrix types in errors; update exhaustive consumers atomically rather than falling through to vector/texture defaults.
- [x] Implement exactly the four construction families and G0's target spellings, including single-evaluation diagonal lowering and copy handling. Keep authoring arguments target-neutral; any generated helper metadata is private, not artifact schema.
- [x] Audit builtin entry rules, unary handling, binary rules, vector constructors, and property handling as soon as the type union widens. Reject matrices in all existing builtins (including scalar-edge `step` and unary/reduction shortcuts), matrix unary negation, and unsupported access. Do not accidentally accept products/addition ahead of Step 1.2.
- [x] Derive matrix component counts from `columns * rows` without introducing a product evaluator. Add shape-unit assertions that equality checks each axis independently and component counts use both axes; unequal synthetic metadata may exercise these utilities but must not enable rectangular shader source, operator rules, or generated-target acceptance. Preserve literal diagnostics, safe unknown results, and tests against scalar-splat diagonal interpretation and old scalar/vector domain regressions.
- [x] Add public/core positive and negative cases for all twelve signatures with authored ranges, plus real compilation of generated constant/dynamic constructors. A fragment may keep a matrix local unused and return a Vec4 until products are added; generated typing and structure are still checked, not claimed as visible matrix math.

Verification:

- Automated: `pnpm --filter shdr check` and `pnpm --filter shdr test` verify declarations, type fixture negatives, exports, and marker behavior. Rebuild `shdr` before `pnpm --filter @shdr/core check`.
- Automated: `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/square-matrix-shape.test.ts test/square-matrix-constructors.test.ts test/square-matrix-generated.test.ts test/math-builtin-parity.test.ts test/lower-swizzles.test.ts` checks both-axis shape equality/component counts, strict local construction/rejection, and real generated-target compilation. The three matrix tests are new in this step.
- Manual: review every newly reachable matrix-kind branch, especially builtin fallthrough and diagonal argument occurrences. No separate UI acceptance needed here.

Completion gate: core shape retains separate columns/rows with both-axis equality and shape-derived counts/emission; all accepted constructor/local forms remain square, typed, source-checked, and compilable in both real targets. Excluded forms fail at authored locations and the type-kind change leaves existing supported behavior buildable. This is not rectangular or whole-feature acceptance.
Evidence: Verified — `shdr check`/`test`, core check, 79 focused core tests, and real WebGL 2/WebGPU generated-constructor compilation passed.

### Step 1.2 — Native arithmetic and conservative product analysis

Status: Verified
Requirements / acceptance: R3, R5, R6, R8; AC4 (public/core/target portions), AC6/AC10 (operator/analysis portions), AC9 (grouping portion), AC11 (generated arithmetic). Editor and pixels remain in Steps 2.1/3.1.
Depends on: Step 1.1.
Review boundary: seven concrete binary families per size, with their own overload/checking/generation tests; no helper annotation expansion yet.

Expected files:

- `packages/shdr/src/operators.ts`, `packages/shdr/test/square-matrix-types.ts` — new internal operator overloads and typed result/negative assertions; preserve the division-only overload boundary in `src/internal.ts`.
- `packages/core/src/{lower-shader-syntax,evaluate-shader-constant}.ts`; both expression generators and expression-grouping helpers only where required — size/direction-safe binary rules and conservative analysis.
- `packages/core/test/square-matrix-operators.test.ts`, `square-matrix-constants.test.ts` — **new**; extend `square-matrix-generated.test.ts`, `readable-grouping.test.ts`, and existing arithmetic regressions as necessary.

Tasks:

- [x] Separate multiplication from division result checking. Admit exactly 21 new binary signatures, preserving native matrix products and authored direction, without enabling scalar-left vector multiplication or matrix/scalar addition.
- [x] Add corresponding concrete internal overloads and result-shape assertions. Reject matrix division in every order and retain matrix unary/access/builtin failures from Step 1.1.
- [x] Emit native operators with unchanged grouping. Distinguish matrix addition from WGSL vector/scalar splatting; test mixed chains and noncommuting products without reassociation.
- [x] Stop matrix-involved products from entering existing componentwise constant evaluation, including vector-valued results. Use appropriately shaped unknowns unless a target-neutral proof is actually justified; test a result feeding domain-sensitive math for absence of a fabricated domain error.
- [x] Cover all new signature families, wrong dimensions, spec examples, existing literal overflow, partial/dynamic inputs, and constant/dynamic generated-target acceptance. Preserve existing scalar/vector analysis and diagnostic codes/ranges.

Verification:

- Automated: `pnpm --filter shdr check`; rebuild `shdr`, then `pnpm --filter @shdr/core check`.
- Automated: `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/square-matrix-operators.test.ts test/square-matrix-constants.test.ts test/square-matrix-generated.test.ts test/vector-arithmetic.test.ts test/lower-division.test.ts test/math-builtin-parity.test.ts test/readable-grouping.test.ts` proves exact shape rules, honest constant analysis, generated acceptance, and unchanged old arithmetic. New tests are added by this step except the generated suite from Step 1.1.
- Manual: review the 21-family coverage against spec R3 and inspect asymmetric generated expressions; visible/numeric product acceptance remains explicitly owned by Step 3.1.

Completion gate: all supported binary shapes agree across types/core/targets; products never masquerade as componentwise constant arithmetic, and division/negation/mixed-size exclusions remain source-owned failures.
Evidence: Verified — public operator fixtures, core check, 90 focused core tests, native grouping checks, conservative product analysis, and real dual-target generated arithmetic compilation passed.

### Step 1.3 — Size-safe local and imported helper boundaries

Status: Verified
Requirements / acceptance: R1, R4–R8; AC1 (helper copy), AC7/AC8 (public/core portions), AC9 (helper/single-evaluation portion), AC11 (generated helpers). Editor/consumer/pixel portions remain in Phases 2/3.
Depends on: Step 1.2.
Review boundary: extend existing helper contracts, not module capture/import semantics or a new helper system.

Expected files:

- `packages/core/src/{parse-shader-functions,lower-shader-functions,lower-shader-syntax}.ts`, existing module-graph/export code only if a demonstrated matrix-specific issue requires it.
- `packages/core/test/square-matrix-helpers.test.ts` — **new**, local/virtual-graph cases; extend `square-matrix-generated.test.ts`.
- `packages/shdr/test/square-matrix-types.ts`; existing `reusable-function-types.ts`/uniform type fixtures if needed — compatibility assertions.

Tasks:

- [x] Admit imported Mat2/3/4 type names and exact helper annotations. Check argument and annotated-return equality by kind and both column/row counts, retaining square-only source acceptance; inferred returns remain concrete through transitive calls.
- [x] Cover named imported helpers with the existing virtual/project graph: matrix construction, composition, matrix parameters, annotated/inferred returns, and copies of helper results. Exercise every size, plus changed-size argument and return failures in original files.
- [x] Generate typed helper parameters/returns on both backends and test a diagonal constructor whose scalar comes from a nested authored helper exactly once, including collision-prone names.
- [x] Preserve fragment Vec4 returns, capture/recursion/import restrictions, no local type annotations, matrix-uniform rejection, and no execution of authored modules. Add failures with the existing specific codes rather than generic backend exceptions.

Verification:

- Automated: `pnpm --filter shdr check`; refresh `shdr`, then `pnpm --filter @shdr/core check` and `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/square-matrix-helpers.test.ts test/square-matrix-generated.test.ts test/reusable-local.test.ts test/reusable-graph.test.ts test/custom-uniforms.test.ts`. The helper suite is new here.
- Manual: inspect imported-file diagnostic ownership and generated single occurrences; real target compilation covers helper signatures but not final pixel claims.

Completion gate: valid matrix helpers and their consumers compose on both targets; dimension mismatches and existing forbidden behaviors remain correctly rejected with no new host/schema surface.
Evidence: Verified — `shdr` checks/tests/build, core check, and 72 focused helper/generated/regression tests passed; local helpers compiled on real WebGL 2/WebGPU targets.

**Phase exit gate G1:** after Step 1.3, rebuild `shdr`; run `pnpm --filter shdr check`, `pnpm --filter shdr test`, `pnpm --filter @shdr/core check`, and the entire core suite via `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root .`. Require complete 12-constructor/21-binary family coverage, helper/negative cases, and real generated-target acceptance in one buildable language slice. Review constant-analysis and exhaustive consumer changes together before advancing. This gate does not claim editor parity or rendered acceptance.
Evidence: Verified — refreshed `shdr`; `shdr` checks/tests/build, core check, full core suite (510 tests), and Step 1 focused target/helper coverage passed.

## Phase 2 — Editor and consumer parity

Outcome: users encounter one matrix contract through original-source tooling and existing application paths.
Depends on: G1.
Review boundary: adapters and fixtures exercise the shared language; they must not supply alternative overloads or matrix runtime evaluation.

### Step 2.1 — TypeScript 7 inference, diagnostics, and edit refresh

Status: Verified
Requirements / acceptance: R1, R4, R6–R8; completes editor portions of AC1/AC2/AC4/AC6/AC7 and hover/refresh portion of AC13. Consumer/browser recovery remains Step 2.2.
Depends on: G1.
Review boundary: existing virtual-source and TypeScript 7 seams, not VS Code transport migration.

Expected files:

- `packages/language-service/test/square-matrix-editor.test.ts` — **new**, using existing fixture project and virtual graph setup.
- `packages/language-service/test/fixtures/project/*matrix*.shdr.ts` — **new only as needed** for imported/unsaved scenarios.
- `packages/core/src/create-virtual-source.ts`, existing transformation/mapping code, and `packages/language-service/src/{typescript-7-checker,typescript-7-editor-adapter,diagnostic-routing}.ts` — change only if focused tests expose a real matrix-specific gap.

Tasks:

- [x] Assert hovers and concrete inferred results for all 12 constructor and 21 binary signatures, with representative local/imported helper parameters and inferred/annotated returns.
- [x] Assert original-source rejection for constructor errors, dimension mismatches, `/`, `-M`, properties/indexing, and existing math calls given matrices; retain more-specific inner errors without virtual-helper cascades.
- [x] Edit valid source to invalid source and back, including unsaved changes to an imported helper's matrix annotation. Require fresh diagnostics/types, imported-file ownership, and unchanged ordinary `.ts` ownership.

Verification:

- Automated: refresh dependencies using the scoped Turbo build command; run `pnpm --filter @shdr/language-service check` and `pnpm --filter @shdr/language-service exec vitest run --config ../../vitest.config.ts --root . test/square-matrix-editor.test.ts test/constructor-parity.test.ts test/arithmetic-parity.test.ts test/reusable-local-editor.test.ts test/diagnostic-routing.test.ts`.
- Manual: no mandatory live VS Code session; real TypeScript 7 adapter coverage is the scoped gate. Do not describe it as manual extension verification.

Completion gate: real TypeScript 7 accepts/rejects the same signature set as core, reports concrete matrix dimensions, and refreshes source-mapped information through unsaved edits.
Evidence: Verified — refreshed `shdr` and scoped dependencies, then passed language-service check and all 103 language-service tests, including the new 12-constructor/21-binary editor suite and unsaved imported-helper edits.

### Step 2.2 — CLI, Vite static artifacts, and browser/REPL recovery

Status: Verified
Requirements / acceptance: R6–R8; AC8 (integration portions), AC13 (consumer/recovery portions), AC14 (artifact/static-isolation portions). Final mathematical pixels and documentation remain in Phase 3.
Depends on: Step 2.1.
Review boundary: consumer fixtures and necessary integration corrections, without runtime API or renderer lifecycle changes.

Expected files:

- `packages/cli/test/cli.test.ts`, `packages/vite/test/index.test.ts` — matrix cases using existing temporary project/graph patterns.
- `apps/vite-basic/src/square-matrices.shdr.ts` — **new** bounded visible example; `src/main.ts`, `src/webgl-only.ts`, and `verify-build.mjs` only as needed to keep the fixture reachable and prove static isolation.
- `apps/repl/verify-browser.mjs` — extend existing compile/edit/recovery path. Do not change its editor or introduce external helper fetching.
- Existing core artifact tests — representative mixed math/helper/uniform/texture compatibility assertions, no schema changes.

Tasks:

- [x] Check valid local/imported matrix helpers through the CLI executable and Vite graph path; reject changed-size signatures and invalid operations at the original file/line/range, never generated source.
- [x] Include the complete finite constructor/operator vocabulary in consumer fixtures or generated fixture cases without building a new fixture framework. Cover browser compilation through `@shdr/core/browser` and a static Vite artifact consumer.
- [x] Ensure the static demo is bundled and artifact/source-map checks still exclude core/parser/DSL execution. Preserve one-backend runtime exclusion in the existing WebGL-only consumer.
- [x] Compile a local-helper matrix shader in the REPL; edit to invalid matrix source, assert diagnostics and the previous valid WebGL/presented-WebGPU frame persist, then correct it and observe refreshed output. Keep the existing external-import-without-graph rejection.
- [x] Compare artifact field/binding behavior with equivalent existing-input shaders, including custom uniform defaults/updates and textures; no matrix data/bindings or compiler-owned objects reach runtime.

Verification:

- Automated: rebuild scoped dependencies; `pnpm --filter @shdr/cli test`, `pnpm --filter @shdr/vite test`, and `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/compile-fragment-artifact.test.ts test/square-matrix-helpers.test.ts` prove executable/graph/artifact paths. CLI's existing pretest builds its binary.
- Automated: `pnpm --filter vite-basic build` runs the existing static isolation verifier; `pnpm --filter repl build` and `pnpm --filter repl exec node verify-browser.mjs` prove browser compile/recovery with the existing pre-provisioned browser. UI output is acceptance of integration, not a substitute for Step 3.1's independently expected matrix results.
- Manual: inspect original-file diagnostics and static-consumer metadata evidence; no external service/authentication required.

Completion gate: consumers agree with core/editor, invalid source does not replace the last good frame, and matrix use adds neither artifact fields nor compiler code to static consumers.
Evidence: Verified — CLI (27 tests), Vite (22 tests), core artifact/helper (22 tests), Vite static isolation, REPL build/check, and real WebGL 2/WebGPU REPL compile/edit/recovery all passed.

**Phase exit gate G2:** after Step 2.2, refresh scoped builds and run the complete language-service suite, CLI suite, and Vite plugin suite using their existing `test` scripts; run `pnpm --filter vite-basic check`, `pnpm --filter vite-basic build`, `pnpm --filter repl check`, `pnpm --filter repl build`, and `pnpm --filter repl exec node verify-browser.mjs`. Require cross-path type/diagnostic/recovery agreement and unchanged artifact isolation in the composed change. No package-specific fallback or unavailable required browser gate counts as success.
Evidence: Verified — scoped Turbo builds passed; language-service (103 tests), CLI (27 tests), Vite (22 tests), app checks/builds, and REPL browser recovery passed with WebGL 2 and WebGPU available.

## Phase 3 — Rendered acceptance and completion

Outcome: the feature's actual pixels, compatibility, and public description satisfy the governing spec.
Depends on: G2.
Review boundary: bounded render verifier and documentation/regression closure; no reference-port fidelity or performance project.

### Step 3.1 — Independent rendered matrix expectations

Status: Verified
Requirements / acceptance: R2, R3, R5, R8, R9; completes rendered portions of AC3/AC5/AC9/AC12, with runtime compatibility evidence contributing to AC14. Compiler/editor portions remain owned by earlier gates.
Depends on: G2.
Review boundary: reuse `packages/runtime/test/verify-orbit-math.mjs` and sibling patterns; no renderer matrix implementation or general GPU testing framework.

Expected files:

- `packages/runtime/test/verify-square-matrices.mjs` — **new**, real WebGL/presented-WebGPU checks.
- `packages/runtime/package.json` — add the verifier to the existing `test` script so acceptance is not an optional orphan command.
- Existing Vite fixture from Step 2.2 if reusable; additional pinned sources may live inside the verifier rather than expanding UI.
- `plans/square-matrices/evidence/rendered-parity.md` — **new when results exist**, concise environment, pinned inputs, expected outputs/encoding, tolerances, and meaningful captures.

Tasks:

- [x] Render all sizes and all arithmetic families using asymmetric coefficients, non-uniform vectors, and noncommuting pairs. Include both vector multiplication directions, all constructor families, zero/identity/non-unit diagonal cases, and the spec's exact small-number 2x2 expectations.
- [x] Make every relevant matrix row/column observable through permitted matrix/vector products rather than adding indexing; use multiple vectors/samples/cases as needed so a wrong coefficient cannot hide in an unobserved lane.
- [x] Derive independent expected values using simple bounded arithmetic or explicit scalar reference formulas. Encode results into visible channels without clipping; compare both backends to expectations as well as each other. Choose and record tolerances that still expose transpose/direction/componentwise mistakes, rather than adopting a broad tolerance by habit.
- [x] Exercise grouping-sensitive nested composition and a nested-helper diagonal case; retain generated-source single-occurrence proof from Step 1.3 because pixels alone cannot prove evaluation count. Update an existing scalar/vector uniform supplying coefficients and draw again.
- [x] Use real WebGL readback and an actually presented WebGPU canvas capture with multiple non-center samples, validation-error checks, and cleanup. Wire the verifier into normal tests; report unavailable capabilities as blocked, never verified/skipped success.

Verification:

- Automated: refresh core/runtime builds with the scoped Turbo build command. After creating the verifier, `pnpm --filter @shdr/runtime exec node test/verify-square-matrices.mjs` must match finite expected pixels and cross-target tolerances at initial and updated inputs.
- Automated: `pnpm --filter @shdr/runtime check`; run existing `pnpm --filter @shdr/runtime exec node test/verify-uniforms.mjs` and `pnpm --filter @shdr/runtime exec node test/verify-textures.mjs` as scoped regression checks for the touched orchestration boundary.
- Manual: review captured evidence and independently expected values for observability and unhidden coefficients; automated evidence is sufficient without mandatory hardware-GPU access. Record software GPU use explicitly.

Completion gate: all required matrix behaviors are observable and correct in WebGL and presented WebGPU, and creation/update cases preserve runtime ownership. No generated-code or module-compilation-only result substitutes for these pixels.
Evidence: Verified — 102 rendered matrix cases and the complete runtime regression suite passed on real WebGL 2 and presented WebGPU; details in `evidence/rendered-parity.md`.

### Step 3.2 — Accurate language documentation and regression closure

Status: Blocked — documentation and scoped checks passed, but G3 remains blocked by the existing `vite-basic` presented-WebGPU regression documented in `evidence/completion.md`.
Requirements / acceptance: R6–R9; AC14 (documentation and full compatibility), final audit of AC1–AC13 through their owning gates.
Depends on: Step 3.1.
Review boundary: documentation and feature-complete regression/audit; changes fixing discovered regressions must carry their own focused proof in the responsible step rather than being hidden as documentation work.

Expected files:

- `README.md`, `packages/shdr/README.md`, `plans/language-exntesion.md`, and relevant `plans/notes.md` matrix discussion — update delivered claims and links without erasing historical rationale.
- `plans/square-matrices/plan.md` — concise final gate outcomes/status only.
- `plans/square-matrices/evidence/completion.md` — **new if needed**, meaningful broad-check results/limitations rather than a transcript or duplicate acceptance checklist.

Tasks:

- [x] Document exact types, four constructor families and column order, seven binary families, helper use, portable numeric limits, and explicit exclusions. Distinguish `matN(s)` from a splat and `M * V` from `V * M`; show `M * -1`, not rejected unary negation.
- [x] Remove stale blanket matrix-rejection claims only when justified by acceptance. Explain the expanded square-size slice in the historical roadmap, preserve historical reference coefficients/fidelity caveats, and repair any affected internal links.
- [x] Audit the acceptance ownership table below against actual proof for all 12 constructors/21 binary signatures and excluded shapes, including size-safe annotations and conservative analysis. Resolve regressions or record explicit blockers/deviations; do not infer completion from task boxes.
- [x] Run G3's repository-level checks after focused proof and document failures, actual browser availability, and the scoped limits of evidence. Format only touched files; do not use the repository-wide writing formatter to modify unrelated work.

Verification:

- Automated: G3 below is this step's broad automated gate. Run `pnpm exec prettier --check plans/square-matrices/plan.md plans/square-matrices/spec.md` and check the actual changed source/documentation files with the same command's explicit file arguments. Run `git diff --check`; include newly added, untracked files in formatting and whitespace review.
- Manual: compare delivered docs and examples with the spec and source; verify historical/reference fidelity is not overstated. Readiness for planning in the original spec must not be mistaken for pre-existing implementation evidence.

Completion gate: docs accurately match verified behavior, acceptance has no silently skipped portion, and G3 is satisfied. If an essential regression/browser gate remains unavailable, leave completion blocked even if source changes are finished.
Evidence: Blocked — documentation, build/check/CLI checks, scoped runtime coverage, and browser capability checks passed, but root `pnpm test` is blocked by the existing `vite-basic` presented-WebGPU pixel regression; details in `evidence/completion.md`.

**Phase exit gate G3:** after Step 3.2's focused documentation checks, run from the root `pnpm build`, `pnpm check`, `pnpm test`, and `pnpm ci:check`, respecting browser provisioning prerequisites and allowing enough runtime for the real suites. Expected result: all applicable workspace builds/type checks/CLI shader checks/tests succeed, including the newly wired runtime matrix verifier and existing artifact isolation checks. Review Step 3.1 pixels and all prior gate results together with the changed-file formatting/whitespace checks before declaring feature completion. Record pre-existing failures separately, but do not treat them as accepted waivers. No publish/deploy/manual approval is implied.
Evidence: Blocked — `pnpm build`, `pnpm check`, and `pnpm ci:check` passed; `pnpm test` reached all suites but failed in the unchanged `vite-basic` presented-WebGPU expectation. See `evidence/completion.md`.

## Final acceptance

The table maps proof ownership, not a second progress checklist. Evidence/status lives in the named steps and their phase exit gates.

| Spec acceptance ID | Owning step / gate | Verification and expected result | Evidence location |
| --- | --- | --- | --- |
| AC1 | Steps 1.1, 1.3, 2.1; G1/G2 | Twelve constructors retain concrete square dimensions through locals/helpers/editor and real targets; core metadata/equality preserves both shape axes independently. | Owning step evidence entries. |
| AC2 | Steps 1.1, 2.1; G1/G2 | Excluded constructor shapes fail at authored locations with no artifact or permissive public type. | Owning step evidence entries. |
| AC3 | Steps 0.2, 1.1, 3.1; G3 | Lowering and actual pixels distinguish zero/identity/diagonal scaling and flat/column equivalence. | Step 3.1 and `evidence/rendered-parity.md` when created. |
| AC4 | Steps 1.2, 1.3, 2.1; G1/G2 | Twenty-one concrete binary signatures agree across types/core/helpers/editor/targets. | Owning step evidence entries. |
| AC5 | Steps 0.2, 1.2, 3.1; G3 | Independent rendered expectations reveal product direction, transpose, and composition errors. | Step 3.1 and rendered evidence. |
| AC6 | Steps 1.1, 1.2, 2.1; G1/G2 | All matrix exclusions fail without broadening old scalar/vector rules. | Owning step evidence entries. |
| AC7 | Steps 1.3, 2.1; G1/G2 | Local/imported helper sizes, returns, and unsaved edits remain exact and source-owned. | Owning step evidence entries. |
| AC8 | Steps 1.3, 2.2; G1/G2 | Matrix helpers do not change fragment return, captures/recursion/mutation, or uniform declarations. | Owning step evidence entries. |
| AC9 | Steps 1.1–1.3, 3.1; G1/G3 | Generated structure proves argument occurrence/name/grouping integrity; rendered cases prove observable semantics. | Steps 1.3/3.1 evidence. |
| AC10 | Steps 1.1, 1.2; G1 | No fabricated componentwise product proof; literal/domain regressions remain correctly handled. | Step 1.2 evidence. |
| AC11 | Steps 0.2, 1.1–1.3; G1 | Raw and Shdr-generated constant/dynamic families compile on both real targets. | G0/G1 and owning step evidence; `evidence/phase-0.md` when created. |
| AC12 | Step 3.1; G3 | Both rendered paths match mathematical expectations before/after existing-uniform updates. | Step 3.1 and rendered evidence. |
| AC13 | Steps 2.1, 2.2; G2 | CLI/static/browser/editor parity, unsaved refresh, and REPL invalid-edit recovery are observed. | G2 and owning step evidence. |
| AC14 | Steps 1.3, 2.2, 3.1, 3.2; G3 | No runtime/schema/binding/bundle regression; full checks and accurate docs complete the feature. | G3 and owning step evidence; completion note if created. |

## Rollback and recovery

- No data migration, irreversible external action, publication, or deployment is planned. Before merge, revert the whole feature if needed; do not leave public types/constructor imports without their checker/generator consumers. Preserve the governing spec and unrelated user changes unless explicitly asked otherwise.
- Within execution, each step's source/types/tests form an atomic review/revert unit. If a later step exposes a prerequisite defect, reopen/fix that owning step and rerun its affected verification and downstream gates. Do not revert only one backend or weaken rejection rules to get a green suite.
- On a failed source compile, existing REPL last-good-frame behavior remains the recovery path. On unavailable browsers or unexpected backend failures, retain the candidate as unverified/blocked and preserve the distinction from authored diagnostics; do not introduce a runtime fallback matrix implementation.
- Temporary projects/servers/browser processes belong to the test invocation and must be cleaned up using existing isolated patterns. Do not delete shared caches, change global toolchains, or reset the user's worktree to recover from a test failure.

## Deferred checks and accepted deviations

- Accepted deviations: **None**. No verification has been waived or claimed complete.
- The baseline is unknown until Step 0.1. Raw-target feasibility is unknown until Step 0.2. Their gates deliberately precede implementation; no green historical result is inherited as the current baseline.
- Hardware-wide GPU precision/performance studies and manual VS Code UI acceptance are not required by this bounded spec. Real TypeScript 7 adapter checks and software-GPU browser evidence are the planned scoped proof, with actual environments recorded.
- Full reference ports, matrix host resources, extra operators/builtins, and interprocedural proofs remain deferred exactly as in the spec. They must not be added as incidental fixes or silently made release prerequisites.
