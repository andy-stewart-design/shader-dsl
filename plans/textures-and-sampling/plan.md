# Still-image textures and sampling implementation plan

## Status and governing source

- Governing spec: [spec.md](spec.md). Keep `sample(texture, uv)` and `u.texture2D(url)` as agreed spellings; do not expand this slice into host image updates or configurable samplers.
- Delivery boundary: one feature-complete PR after all step and phase gate boxes are checked. This plan is not implementation or publishing approval.
- Blockers: Phase 0 must establish the spec's decoded sRGB/straight-alpha and top-left orientation behavior on both actual browser backends, and a Vite public URL strategy for configured bases (including `base: "./"`). If a probe contradicts the spec, stop the affected phase and review the spec; do not silently narrow supported paths or color semantics.

**Checklist policy:** `plan.md` is the execution checklist, not a progress log. Check off tasks as they are done; check off each step's completion gate only after its stated checks and review pass, then check off the phase exit gate before advancing. Keep results, commands, environment, failures, deviations, and approvals in separate feature notes under `plans/textures-and-sampling/evidence/` when needed, not in this plan. If blocked, leave the gate unchecked and document why elsewhere. Change plan text only for a material change of direction or scope; do not add status lines, evidence summaries, dated updates, or a second progress tracker here.

## Execution constraints

- Paths are repository-relative. Preserve unrelated work, including other language work in progress; expected file lists are scope estimates, not authorization to edit unrelated files. No new production dependency on Vite/Node inside browser core, authored-JavaScript execution, fetched `.shdr.ts` imports in the REPL, or automatic codegen/resource fallback.
- The current baseline is **static inspection only**: `packages/core/src/parse-custom-uniforms.ts` and `packages/shdr/src/types.ts` accept numeric declarations; the IR/generators have no texture expressions; `packages/vite/src/index.ts` emits JSON as source; `packages/runtime/src/webgl.ts` and `webgpu.ts` preflight candidate draws; `apps/repl` has one shader textarea and two renderers. Existing browser scripts are verification seams, not evidence of texture support. Record any pre-existing test failures separately.
- Preserve existing JSON artifact consumers, automatic WebGPU group 0, numeric custom group 1, original-source diagnostics, f32 results, static-consumer compiler exclusion, and successful old shader/first-frame behavior. A resource failure must never be repackaged as a source diagnostic or silently clear a healthy installation.
- Intermediate steps must build and preserve previously supported shaders. Steps 1.2–2.3 are an **atomic new-feature merge/revert group**: a generated sampler shader is not publicly supported until both renderers can load and draw it. Phase 1's compiler/target checks do not claim first-frame rendering. Texture-capable `.shdr.ts` modules must not be published or presented as delivered mid-group.
- Real browser gates require Playwright Chromium with WebGL 2 and a working **presented** WebGPU adapter. A missing adapter, unavailable VS Code executable, or failed external CORS setup is Blocked, not Verified; do not substitute generated text, mocks, or WebGPU module creation for visible pixels.

## Phase overview and delivery boundary

| Phase | Outcome                                                                          | Dependencies | Exit gate                                                                               |
| ----- | -------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| 0     | Reproducible browser/Vite feasibility and remaining technical decision lock      | Spec         | Raw image/channel/UV probes and base-path findings reviewed; spec conflict stops work   |
| 1     | Typed declaration, artifact, `sample` lowering and mapped compiler/editor errors | Phase 0      | Public type/core/editor/CLI checks, both real target compilers, old artifacts unchanged |
| 2     | Both browser renderers load/bind images and retain atomic installation semantics | Phase 1      | Real two-backend first-frame/UV/color/alpha pixels and async-failure/supersession tests |
| 3     | Vite public assets, REPL HTTPS-only path and accepted docs compose end to end    | Phase 2      | Vite dev/base build + REPL browser + editor/bundle + workspace regression gates         |

Delivery boundary: **one feature-complete PR after Phase 3**, not one PR per step. The atomic Step 1.2–2.3 group covers public sampling/target generation through real two-renderer consumption; revert it together if its integration gate fails. Step 1.1's schema/validation may be reviewed independently, but must not leave partially usable texture input in a released artifact. No cleanup of old numeric uniform paths until the new mixed schema passes parity.

## Phase 0 — Technical feasibility and contract gate

Outcome: establish the upload/sampling and base-path behavior needed to implement the governing spec without guessing about browsers or Vite.
Depends on: Spec only.
Review boundary: raw browser/Vite probes and baseline inspection, **not** shipped texture syntax/runtime behavior.

### Step 0.1 — Browser image, sampling and resource limits

Requirements / acceptance: R2, R5, R7; AC3 and AC8 **feasibility only** (full acceptance in Steps 2.2–2.3).
Depends on: None.
Review boundary: raw WebGL 2/WebGPU image decoding, sample, origin/alpha and binding feasibility; no production code.

Expected files:

- `packages/core/test/texture-target-feasibility.test.ts` (new) — raw-target browser probe; keep as a regression test if stable.
- `plans/textures-and-sampling/evidence/phase-0.md` (new **only if** consequential probe findings/choices need review) — findings and review evidence outside the checklist.

Tasks:

- [x] Record a focused pre-change baseline from current type/core/runtime/browser tests and note existing failures separately.
- [x] Probe a browser-decoded non-square sRGB PNG with quadrant colors and semi-transparent pixels on raw WebGL 2 and WebGPU; check top-left UV, off-center fractional interpolation, out-of-range clamp, straight-alpha channel values and presented output rather than only shader validation.
- [x] Check browser decode/copy options and GPU resource limits for multiple named fixed-linear, clamp-to-edge, no-mipmap images; compare a one-texture and a two-texture sample to detect binding collisions.
- [ ] If normalized encoded RGB/straight-alpha or the agreed UV policy cannot be obtained on both targets, record the observed conflict and **stop** for spec review before changing user-visible semantics.

Verification:

- Automated: proposed `pnpm --dir packages/core exec vitest run --config ../../vitest.config.ts --root . test/texture-target-feasibility.test.ts`; assert real target creation and observed pixels/channels (including non-center and semi-transparent), not just compilation. Baseline: existing focused `pnpm --filter @shdr/core test` and `pnpm --filter @shdr/runtime test` (the latter runs real browser suites); record actual results, no assumed green state.
- Manual: with a working Playwright Chromium/WebGPU setup, inspect any failed channel/origin case and compare browser-decoded source values; record whether a portable upload policy exists. No manual GPU claim from a mocked browser.

- [x] **Completion gate:** Real raw targets exhibit a feasible implementation of R2/R7 with testable channel/alpha tolerances and sufficient binding layout; if not, stop and review the spec.

### Step 0.2 — Vite public URLs and deployment bases

Requirements / acceptance: R4; AC4 **feasibility only** (end-to-end gate in Step 3.1).
Depends on: None; assess together with Step 0.1 at phase exit.
Review boundary: deployment-path probe only; do not rewrite the compiler or ship a URL policy.

Expected files:

- `packages/vite/test/texture-base-feasibility.test.ts` (new, if stable) — disposable Vite public-directory dev/build URL probe.
- `plans/textures-and-sampling/evidence/phase-0.md` (optional) — decisive base-resolution findings and proposed mechanism.

Tasks:

- [x] Use a disposable Vite project with `public/photo.png` and inspect dev/root, non-root absolute `base`, and relative `base: "./"` built deployments; distinguish Vite-processed imports from URLs stored in Shdr artifact JSON.
- [x] Determine a Vite-only, base-aware asset URL representation that still produces a JSON data artifact at runtime and does not modify `@shdr/core` or bundle the compiler into the static consumer.
- [x] Decide how a standalone `compileFragmentArtifact` preserves `/photo.png` while Vite applies its deployment base; explicitly flag any unsupported Vite base mode as a **spec decision**, not a silent implementation exception.

Verification:

- Automated: proposed `pnpm --dir packages/vite exec vitest run --config ../../vitest.config.ts --root . test/texture-base-feasibility.test.ts`; inspect actual dev/build asset URLs and requests in disposable base configurations (not the completed Shdr feature).
- Manual: if a relative base depends on browser page URL, serve the built disposable app from a nested path and inspect the requested resource URL. No claim of Vite plugin integration yet.

- [x] **Completion gate:** A concrete, testable Vite strategy covers the spec's public-path behavior; if not, stop for spec review.

- [ ] **Phase exit gate:** Review both probe outcomes, any spec adjustments, a focused baseline, and feasible GPU binding/color + Vite URL strategies before Phase 1. Target tests do not certify Shdr authoring or renderer behavior.

## Phase 1 — Public language, artifact and editor

Outcome: a texture declaration and `sample` call compile to one JSON artifact with valid GLSL/WGSL and original-source checking. Rendering support remains Phase 2.
Depends on: Phase 0 exit.
Review boundary: types, static analysis, IR, generators and existing editor/CLI paths only; no claim that a browser renderer can draw the new shader.

### Step 1.1 — Texture declaration and mixed-schema boundary

Requirements / acceptance: R1, R3, R8; AC1 (declaration/types part), AC2 (schema part), AC7 (numeric isolation part), AC8 (metadata validation part). Sampling/real renderer coverage remains Steps 1.2–2.3.
Depends on: Phase 0 exit.
Review boundary: `u.texture2D` literal declaration, typed handle, stable JSON metadata, numeric uniform isolation; no shader sampling support yet.

Expected files:

- `packages/shdr/src/{types,dsl,index}.ts`, `packages/shdr/test/` — public builder and expression/host patch types, compile-only marker, positive/negative type fixtures.
- `packages/core/src/{parse-custom-uniforms,parse-shader-file,shader-module-graph,shader-ir,compile-fragment-artifact}.ts`, `packages/core/test/{custom-uniforms,reusable-graph}.test.ts` — original-source declaration and graph checks, deterministic separate numeric/resource metadata.
- `packages/runtime/src/{types,uniforms,shared}.ts`, `packages/runtime/test/uniforms.typecheck.ts` and metadata tests — numeric-only `setUniforms`/`resetUniforms` and artifact validation when texture declarations are present but unused.

Tasks:

- [ ] Add literal-only `u.texture2D(url)` to the existing chained/named/imported schema forms, with reserved/duplicate name and malformed URL diagnostics at authored ranges; do not execute authored code or fetch in parsing.
- [ ] Keep resource-valued declarations distinct from numeric UBO/storage and `HostUniforms` patches, while preserving complete deterministic schema metadata for unused fields and old numeric-only artifacts.
- [ ] Add required metadata validation at the artifact boundary (including malformed/duplicate names, URL kind and reference consistency); do not infer bindings by parsing GLSL/WGSL.
- [ ] Add typed/rejected cases for texture-as-number, numeric value as texture, texture key in `setUniforms`/`resetUniforms`, and old numeric update behavior. Confirm runtime can accept an artifact with an unused declared texture without attempting a fetch.

Verification:

- Automated: existing `pnpm --filter shdr test`, `pnpm --filter @shdr/core test`, `pnpm --filter @shdr/runtime check`, plus focused new schema/metadata tests in those suites. Assert JSON-only declarations, no network activity for unused resources, old artifact compatibility, and type/rejection parity.
- Manual: Not needed for this static declaration/unused-resource scope; image rendering remains unverified.

- [ ] **Completion gate:** Declaration-only schema and old consumers build/check; invalid declaration, forbidden host patch and malformed artifact cases fail at the right boundary without changing old shader behavior.

### Step 1.2 — Sampling IR, two generators, mapped editor and CLI

Requirements / acceptance: R1–R3, R8; AC1 (complete language/type/editor/CLI portion), AC2 (generated artifact/target portion). AC3/AC8 real rendering remains Phase 2.
Depends on: Step 1.1.
Review boundary: **single bounded compiler/editor change** for one sampling operation, UV type and original-source diagnostics; no backend resource installation.

Expected files:

- `packages/shdr/src/{types,dsl,index}.ts`, `packages/shdr/test/` — imported `sample` marker/signature and explicit helper restrictions.
- `packages/core/src/{shader-syntax,validate-shader-syntax,lower-shader-syntax,shader-ir,generate-glsl-expression,generate-glsl-fragment,generate-wgsl-expression,generate-wgsl-fragment,compile-fragment-artifact}.ts`, `packages/core/test/` — texture-only reference/call IR, original ranges, deterministic per-target bindings and guarded naming.
- `packages/core/src/{parse-shader-file,transform-shader-expressions}.ts`, `packages/language-service/src/{typescript-7-editor-adapter,typescript-7-checker}.ts`, `packages/language-service/test/`, `packages/cli/test/` — virtual-source parity, imported-schema/UV hovers and diagnostic routing.

Tasks:

- [ ] Support only direct-imported `sample(texture, uv)` in fragment callbacks; reject wrong arity/type, unknown/unimported callee, helper texture parameters/returns/captures, and use of texture handles as numeric expressions, with exact authored spans.
- [ ] Add a resource-specific typed IR form or equivalent so a texture handle cannot silently become a numeric `ShaderExpression`; preserve f32 UV grouping and `Expr<Vec4<F32>>` result. Track active texture names for both targets without changing automatic/numeric bindings.
- [ ] Generate GLSL ES 3.00 and WGSL sampling/binding declarations with deterministic collision-safe names and a backend-consistent top-left convention, fixed linear/clamp semantics, and resource metadata. Do not introduce authored-JS execution or runtime callback objects.
- [ ] Pair public types/virtual TS mapping with core and CLI fixtures: fragment + same-file/imported schema, helper-computed UV/color, wrong UV/arity/capture, unsaved edits, ordinary `.ts` isolation and source-file ranges. Test actual WebGL shader/link and WGSL module/pipeline compilation against generated code using the Phase 0 raw target harness.

Verification:

- Automated: `pnpm --filter shdr test`, `pnpm --filter @shdr/core test`, `pnpm --filter @shdr/language-service test`, `pnpm --filter @shdr/cli test`, and `pnpm --filter @shdr/lsp test` after rebuilding affected packages as needed. New focused tests must assert complete metadata, source ranges and real target compilation, not just snapshots or fabricated type hovers.
- Manual: Not needed for compilation proof; source-located real VS Code acceptance is included at Step 3.3. **No pixel claim** at this step.

- [ ] **Completion gate:** Compiler/type/editor/CLI/target-compilation checks pass for every new shape and meaningful negatives while old shaders still compile; sampled rendering remains unverified under the atomic 1.2–2.3 gate.

- [ ] **Phase exit gate:** `pnpm build`, focused Phase 1 public/core/editor/CLI/LSP checks, and real target compilation pass without regressions; sample shaders are not yet a supported runtime feature. Review before proceeding.

## Phase 2 — Browser renderer resources and image pixels

Outcome: the single artifact loads/binds still images on separate WebGL/WebGPU surfaces, with correct sampled pixels and preserved candidate-install lifecycle.
Depends on: Phase 1 exit.
Review boundary: browser resource loading, validation, binding and cleanup; no Vite public rewrite or REPL policy yet.

### Step 2.1 — Shared loading/validation and asynchronous state boundary

Requirements / acceptance: R3–R6; AC6 (deterministic state portion), AC8 (resource-limit/validation portion). Real image pixel/loss proof remains Steps 2.2–2.3.
Depends on: Phase 1 exit.
Review boundary: browser-only fetching/decoding and resource metadata consumption, with injectable network/decoder seams in tests; neither GPU backend is claimed complete.

Expected files:

- `packages/runtime/src/{shared,errors}.ts`, `packages/runtime/src/texture-resources.ts` (new if useful), `packages/runtime/test/texture-resources.test.ts` (new) — decoded-resource lifecycle, URL/CORS failures and validation tests.
- `packages/runtime/src/{webgl,webgpu}.ts` — adapt candidate preparation and cleanup seams only as needed for shared loading; GPU upload belongs to later steps.

Tasks:

- [ ] Validate referenced resource metadata/URL and backend limits before allocating; load only referenced images, with a no-fetch rule for unused declarations. Distinguish an invalid artifact from fetch/CORS/decode errors via observable runtime errors.
- [ ] Implement one candidate-local async fetch/decode lifetime with generation checks/abort where possible; a superseded or disposed candidate cannot commit, draw, mutate error status or leak a decoded bitmap.
- [ ] Keep fetching/decoding in browser runtime only, without modifying compiled GLSL/WGSL or causing renderer entry points to import the compiler/other backend.
- [ ] Add deterministic deferred-fetch/failed-decode/supersession/disposal tests with injected dependencies; explicitly leave real GPU ownership and presented pixels to Steps 2.2–2.3.

Verification:

- Automated: proposed `pnpm --dir packages/runtime exec vitest run --config ../../vitest.config.ts --root . test/texture-resources.test.ts` after adding this focused Vitest test; `pnpm --filter @shdr/runtime check`. Assert no stale commit/error and no fetch on unused metadata. Mocked fetch does **not** prove browser CORS or upload.
- Manual: Not needed for the mocked preparation boundary; later steps verify actual browser APIs.

- [ ] **Completion gate:** Candidate loading is generation-safe and resource failure is classified correctly under deterministic tests; no rendering claim.

### Step 2.2 — WebGL sampled first frame and replacement

Requirements / acceptance: R2, R3, R5–R7; AC3 (WebGL portion), AC6 (WebGL portion), AC7 (numeric isolation), AC8 (WebGL limit). Presented WebGPU and complete cross-target parity remain Step 2.3.
Depends on: Step 2.1.
Review boundary: WebGL GPU texture/program ownership, first draw and offscreen preflight; no WebGPU success claim.

Expected files:

- `packages/runtime/src/webgl.ts`, `packages/runtime/test/verify-textures.mjs` (new), `packages/runtime/package.json` — upload/binding/disposal and browser regression entry.
- `packages/runtime/test/` fixtures (new, as needed) — served multicolor and semi-transparent sRGB images and an image-loading failure source.

Tasks:

- [ ] Upload browser-decoded images with fixed linear/clamp/no-mipmap settings, bind only active samplers to stable texture units, and keep the existing WebGL preflight framebuffer **separate** from sampled resources. Check incomplete textures, limit exceedance and GL errors rather than drawing black.
- [ ] Finish loading/binding **before** candidate preflight and first presented draw; retain old program/textures on failed candidate and free candidate resources on success, failure, supersession, disposal or context loss.
- [ ] In a real Chromium WebGL 2 test, observe top-left, fractional, clamp, sRGB and straight-alpha sample values and numeric uniform updates without a texture refetch. Force missing/corrupt/CORS image, rapid replacement and disposal/loss conditions; assert no bad candidate takes over.

Verification:

- Automated: from `packages/runtime`, run the **proposed** `node test/verify-textures.mjs` after adding it; then `pnpm --filter @shdr/runtime test` once the package script includes it. Assert actual WebGL readPixels (including non-center texels), resource errors and prior-shader preservation.
- Manual: If browser renderer availability or pixel behavior differs, inspect real browser errors and sampled pixels in Chromium with a local served image; record any contract mismatch before Step 2.3.

- [ ] **Completion gate:** Real WebGL first-frame and failed-replacement behavior matches spec; no claim about WebGPU or Vite yet.

### Step 2.3 — Presented WebGPU parity, lifetime and combined browser gate

Requirements / acceptance: R2, R3, R5–R7; AC3 (complete), AC6 (complete browser portion), AC7 (both backends), AC8 (WebGPU limit). URL/REPL integration remains Phase 3.
Depends on: Step 2.2.
Review boundary: WGSL texture/sampler bindings and candidate resources on WebGPU; cross-backend real pixel/lifecycle parity.

Expected files:

- `packages/runtime/src/webgpu.ts`, `packages/runtime/src/texture-resources.ts` (if needed), `packages/runtime/test/verify-textures.mjs` and `packages/runtime/package.json` — GPU texture/sampler/bind group preparation, scopes and destruction, combined WebGL/WebGPU browser checks.

Tasks:

- [ ] Upload textures and bind an explicit texture+fixed sampler for each active declaration without shifting automatic group 0 or numeric group 1; destroy all candidate/installed GPU textures on replacement/disposal/loss.
- [ ] Keep WGSL error scopes and preflight within the existing serialized render path, with generation checks around every awaited load/upload; prove failed candidate and stale uploads do not clear or overwrite the current presentation/status.
- [ ] Extend the browser suite for real **presented** WebGPU non-center/fractional/out-of-range samples, multiple textures, alpha/channel agreement with WebGL under Phase 0 tolerances, plus creation/failure/race/disposal and numeric uniform preservation.

Verification:

- Automated: run `node test/verify-textures.mjs` from `packages/runtime` (proposed script from Step 2.2, extended here), plus `pnpm --filter @shdr/runtime test` once wired. Assert visibly presented WebGPU pixels, not just WGSL compilation; error/draw cases must check last-installed behavior and no late commit.
- Manual: confirm the real browser exposes WebGPU with an adapter; if unavailable, mark **Blocked**, not Passed from WebGL pixels alone.

- [ ] **Completion gate:** Both independent browser renderers pass color/UV/alpha and atomic resource lifecycle checks; all of AC3 and renderer portions of AC6–AC8 are supported by real browser verification recorded outside this plan.

- [ ] **Phase exit gate:** `pnpm --filter @shdr/runtime check` and the newly wired `pnpm --filter @shdr/runtime test` pass, alongside unchanged old numeric/default runtime cases and static renderer imports. Review the atomic 1.2–2.3 feature slice before exposing it through consumer apps.

## Phase 3 — Vite, REPL and acceptance

Outcome: Vite's `public/` URLs and the REPL's external HTTPS literals use the validated runtime, with docs, editor check and static bundle isolation intact.
Depends on: Phase 2 exit.
Review boundary: consumer integration and complete acceptance, not new texture formats, updates or sampler options.

### Step 3.1 — Vite `public/` and configured base

Requirements / acceptance: R4, R8; AC4 (complete), AC2 (static bundle portion).
Depends on: Phase 2 exit and Phase 0.2 decision.
Review boundary: Vite-only URL adaptation plus a real static app, not a change to the standalone compiler.

Expected files:

- `packages/vite/src/index.ts`, `packages/vite/test/index.test.ts` and the Phase 0 base fixture — URL metadata adaptation without changing core; tests for dev/build base behavior.
- `apps/vite-basic/public/photo.png` (new), `apps/vite-basic/src/` texture fixture, `apps/vite-basic/{verify-build,verify-dev,verify-render}.mjs` — build/dev requests, static-bundle isolation and real sampled pixels.

Tasks:

- [ ] Apply Vite's configured public base **only** to root-absolute artifact resource URLs; leave HTTPS URLs and standalone artifacts unchanged. Use the Phase 0 strategy and verify nested deployment paths (and relative base if confirmed), not only the current root-base app.
- [ ] Serve a known public image and check real dev/build browser network URLs and sampled pixels. HMR of the shader URL text may replace the shader; changing image bytes at the same URL need not auto-refresh.
- [ ] Assert artifact remains JSON data, Vite app importing only renderer+static shader excludes compiler/parser modules, and separate backend entries do not pull in each other.

Verification:

- Automated: `pnpm --filter @shdr/vite test` for plugin metadata/path cases and `pnpm --filter vite-basic test` for existing build/dev/render scripts extended with base-aware fixture. In tests verify requested URL **and** pixels; a transformed string alone cannot prove load success.
- Manual: serve the production build under a nested path, open the app and inspect the network request and top-left/non-center pixel; if the configured base variant cannot be exercised automatically, mark that variant Blocked, not Verified.

- [ ] **Completion gate:** Vite dev, production and scoped base deployment resolve intended `public/` image without a wrong root fetch, while external HTTPS URLs are not rewritten and no compiler enters the static browser bundle.

### Step 3.2 — Single-textarea REPL HTTPS policy and two previews

Requirements / acceptance: R4, R6, R8; AC5 (complete), AC6 (REPL status portion).
Depends on: Phase 2 exit.
Review boundary: REPL-only URL policy, per-target status and one text source; no image picker or shader import fetching.

Expected files:

- `apps/repl/src/{App,use-shader-previews}.tsx` (adapt exact files as needed), `apps/repl/verify-browser.mjs`, `apps/repl/README.md` — reject unsupported URL forms and report resource failures per renderer.

Tasks:

- [ ] Accept only literal externally hosted HTTPS texture URLs for REPL shader resources and reject root-relative, protocol-relative, `http:`, dynamic and non-network forms **before fetch**, without imposing REPL-only restrictions on core/Vite.
- [ ] Compile from the existing single textarea, install in both independent preview canvases, and distinguish source diagnostics, REPL URL policy errors, image fetch/decode/CORS errors, and WebGPU unavailability. Preserve last successful shader when a new image load fails.
- [ ] Test with a locally controlled HTTPS/CORS-enabled fixture and denied/missing-image responses; do not rely on a flaky public remote service. A deliberately blocked CORS case must produce a visible error, never a fake success.

Verification:

- Automated: `pnpm --filter repl test` runs `apps/repl/verify-browser.mjs` after adding texture cases, with a deterministic HTTPS fixture or test-controlled request interception that still exercises browser CORS/policy; assert no `.shdr.ts` import request and correct independent canvas statuses. Distinguish intercepted/mock URL-policy checks from a **real** cross-origin CORS browser case.
- Manual: in Chromium with real WebGPU enabled, paste an HTTPS image shader, compile, inspect both previews and a denied CORS URL. If HTTPS fixture/cert or CORS network preconditions are unavailable, mark the external-load proof Blocked rather than asserting it from intercepted requests alone.

- [ ] **Completion gate:** Externally hosted HTTPS loads in both previews; invalid/CORS failures are visible before any forbidden fetch or stale status, with no added picker and no source-module request.

### Step 3.3 — Language docs, editor UI and full regression review

Requirements / acceptance: R1–R8; AC1 (real editor check), AC2 (bundle/old-artifact regression), AC3–AC8 (integration review against owning gates).
Depends on: Steps 3.1 and 3.2.
Review boundary: documentation and acceptance review; no new API or resource scope.

Expected files:

- `README.md`, `packages/shdr/README.md`, `packages/runtime/README.md`, `packages/vite/README.md`, `apps/editor-fixture/` (fixture + real-editor test), `plans/notes.md` — accepted syntax, URL policy, sampler/alpha limits, source-located diagnostics and reviewed follow-ups.
- `plans/textures-and-sampling/evidence/` (only if needed) — separate final acceptance results and material limitations; keep this plan to checkbox updates.

Tasks:

- [ ] Reconcile accepted language and runtime docs with `u.texture2D`, `sample`, Vite public/base vs REPL HTTPS URLs, static/binding metadata, top-left UV, fixed linear/clamp/no-mips, alpha, failure semantics and deferred updates/picker.
- [ ] Exercise a texture shader and invalid sample/URL in the real VS Code fixture; verify source-located diagnostic/hover, ordinary `.ts` isolation and no generated helper cascades. Do not require the separate proposed VS Code-to-LSP migration to land.
- [ ] Audit spec AC1–AC8 against owning gates, inspect the final diff for stray compiler imports and regressions, and run workspace build/check/tests with real browser suites. Document skipped/blocked checks and any accepted deviations outside this plan; leave affected gates unchecked.

Verification:

- Automated: `pnpm build`, `pnpm check`, `pnpm test`, `pnpm ci:check`, `pnpm --filter @shdr/editor-fixture test:editor` (real VS Code when installed), Prettier check and `git diff --check`; compare old shader/artifact/binding tests plus texture browser results. A static check alone does not substitute for browser results.
- Manual: open the real editor and both browser preview contexts when the test harness cannot assert tokens/status; check authored ranges, non-center image pixels, active URL network requests and preservation on failed replacement. Record browser/VS Code versions and any missing environment prerequisite.

- [ ] **Completion gate:** All applicable AC1–AC8 are supported by verification recorded outside this plan, browser/editor checks pass, docs match shipped behavior, and reviewers find no unsupported widening. Stop before merge/publish.

- [ ] **Phase exit gate:** After Step 3.3, review `pnpm build`, `pnpm check`, `pnpm test`, `pnpm ci:check`, real VS Code if available, Vite dev/nested build requests, REPL HTTPS/CORS and both real renderer pixel/error gates; accept only a feature-complete change with explicit residual risks.

## Final acceptance

| Spec acceptance ID | Owning step / gate    | Verification and expected result                                                 |
| ------------------ | --------------------- | -------------------------------------------------------------------------------- |
| AC1                | 1.1, 1.2, 3.3         | Public/core/editor/CLI positives and authored-range negatives, real editor check |
| AC2                | 1.1, 1.2, 3.1, 3.3    | JSON metadata, target binds, Vite static bundle and old artifact isolation       |
| AC3                | 0.1 (probe), 2.2, 2.3 | Known PNG and real WebGL/presented-WebGPU UV/alpha/color parity                  |
| AC4                | 0.2 (probe), 3.1      | Public image dev/base build request and real pixels; standalone unchanged        |
| AC5                | 3.2                   | HTTPS and blocked CORS/policy in independent REPL previews                       |
| AC6                | 2.1–2.3, 3.2          | Supersession, dispose/loss, failure preservation and REPL status                 |
| AC7                | 1.1, 2.2–2.3          | Invalid resource host patch and retained numeric uniform behavior                |
| AC8                | 1.1, 2.1–2.3          | Artifact/resource validation and target limit errors without wrong binding       |

This table assigns acceptance ownership, not progress. Record results outside `plan.md`; check off the owning gates here only after the supporting verification and review. Final broad regression does not waive a missing raw GPU or real-browser acceptance gate.

## Rollback and recovery

No destructive migration or published format is authorized. The texture schema, typed marker, generated shader, metadata, renderer support and consumers should merge as **one** feature; if integration fails, revert Steps 1.2–2.3 and any dependent Phase 3 consumer/doc changes together, not only the GPU backend. Preserve the numeric schema and old artifact interpretation throughout. A failed shader install retains the last good shader and frees candidate resources; a device/context loss remains terminal and requires recreating the renderer/canvas. Partial browser acceptance cannot be represented as a completed portable feature.

## Deferred checks and accepted deviations

- Any future accepted deviation must be justified outside this checklist, with the affected gate left unchecked unless its requirement is revised through a material spec/plan change. No deviation or verification has been recorded here.
- Publication/clean-install distribution, image-picker uploads, host-side texture swaps, sampler configuration, video/mipmaps, broader color-profile support and automatic asset-content HMR are outside this first slice. Revisit under separate contracts, not as unrecorded exceptions to this one.
