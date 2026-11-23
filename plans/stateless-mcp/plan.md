# Stateless MCP Implementation Plan

## Governing source

- Governing spec: [spec.md](spec.md)
- Feature context: [overview.md](overview.md)

This plan is an execution contract. Scope, steps, IDs, dependencies, expected files, verification definitions, completion gates, and acceptance mappings remain fixed during routine execution. A task checkbox records work performed, not acceptance, approval, publication, deployment, or release. In supervised execution, manual approvals remain in extension state.

## Execution constraints

- Paths and commands are relative to the `shader-dsl` repository root unless a different working directory is specified. Preserve unrelated work. Expected files bound the change surface, not permission to rewrite unrelated behavior.
- Use Node >=24 and pnpm 12.6.0. Use SDK server/client/core 2.4.0 as the researched baseline where those packages are directly needed; keep related packages aligned. Server runtime dependencies must not depend on development-only client packages.
- Carry the spec's explicit working assumptions: retain legacy clients and exclude changes to Pi. Installed Pi 1.4.0 uses its independent `pi-mcp` client and supports revisions only through 2025-11-25; modern-server proof and Pi compatibility proof are separate.
- No tests, builds, installations, or live connections were run to author this plan. There is no asserted green baseline. Step 0.1 records existing failures before implementation; a blocker that prevents attribution stops affected work rather than silently weakening a gate.
- Keep browser wire formats, safety limits, ownership, application tools, and `.pi/mcp.json` unchanged. Do not introduce an MCP HTTP endpoint, new protocol flag, multi-principal helper, or new public package entry point.
- Routine plan edits are limited to task checkboxes. Other plan changes require explicit agreement, recorded concisely with rationale and actual agreement in `evidence/changes.md`. Escalate material spec/API conflicts before affected work.
- Every step has one evidence note, created only when there is a result or blocker. Record checks, outcome, and material caveats in a few bullets; do not copy transcripts, pairing URLs/tokens, resume credentials, or repetitive inventories. Phase/final gate evidence belongs in the specified owning note, not mutable plan status.
- Check a verification task only when its required checks and completion gate pass and evidence is recorded. Failed, blocked, skipped, or waived checks remain unchecked; record the reason, follow-up, and known approval owner. A waiver is not a pass.
- Execution may install workspace dependencies and use isolated temporary packed consumers. `test:packed` invokes networked `npm install --ignore-scripts` in a temporary directory; it is not a no-network check or publication. Live acceptance separately requires the user's approval, access to Pi and a disposable browser page, and a working preview renderer. A plan is not permission to perform live actions, publish, deploy, or change the global Pi installation.

## Phase overview and delivery boundary

| Phase | Outcome | Dependencies | Exit gate |
| --- | --- | --- | --- |
| 0 | Reproducible baseline and verified SDK/API test seams. | Existing checkout and local tooling. | Baseline evidence and dependency/lifecycle mapping allow attribution of subsequent changes. |
| 1 | A buildable SDK v2 migration and a dual-era CLI with separated helper/probe lifetimes. | Phase 0 exit. | Legacy, pinned-modern, direct attachment, fallback, and close checks compose successfully. |
| 2 | Explicit-state, security, cancellation, and recovery invariants hold across protocol eras. | Phase 1 exit. | Complete bridge suite and REPL regressions demonstrate parity and modern negative cases. |
| 3 | Installed artifacts and real client/browser usage establish final compatibility. | Phase 2 exit; live access for Step 3.2. | Packed consumer, workspace regression, documentation review, and separate modern/Pi browser acceptance. |

Delivery boundary: one feature-complete PR. Steps are review slices, not separate releases. Intermediate SDK-only migration is not advertised as 2026 support.

Atomic groups: Step 1.1's dependency/lockfile, production imports, and test-client API changes land/revert together. Step 1.2's serving factory, CLI consumer, and lifecycle tests land/revert together. Delivery of this feature requires all phases; passing automated gates alone does not satisfy live acceptance.

## Phase 0 — Baseline and boundary confirmation

Outcome: Existing failures and migration-critical APIs are identified without changing application behavior.  
Depends on: Local prerequisites above.  
Review boundary: Read-only characterization and evidence; no prerequisite bug fix or dependency installation is included in this phase.

### Step 0.1 — Record the baseline and lock verification seams

Requirements / acceptance: R1–R10 (preconditions only); no acceptance criterion is satisfied by this baseline.  
Depends on: None.  
Review boundary: Existing commands, public surface, version negotiation, resource ownership, and deterministic test design.

Expected files:

- `evidence/step-0.1.md` — add baseline results and a concise migration/API map.
- Read only: `packages/agent-bridge/{package.json,tsconfig.json,tsdown.config.ts,src/server.ts,src/bin.ts,test/*.test.ts}`, `apps/repl-web/package.json`, and `.pi/mcp.json`.

Tasks:

- [ ] Record Node/pnpm versions, current SDK manifest/lock resolution, public server methods and entry points, fixed four-tool schemas, and current browser protocol/limit constants.
- [ ] Inspect the tagged SDK 2.4.0 APIs before implementation: server/client root exports, stdio subpath, `callTool` signature changes, factory context, transport ownership, client negotiation, and negotiated-version accessors. Confirm that stream/in-memory injection and fake timers can exercise probe disposal without global stdin mutation.
- [ ] Run the existing bridge and REPL baseline commands below; record failures separately from regressions. Identify any missing local prerequisite without changing the global toolchain or invoking a live server.
- [ ] Satisfy the verification and completion gate below and record concise evidence.

Verification:

- Existing commands, from `packages/agent-bridge`: `pnpm check` and `pnpm test`. The latter builds through `pretest` before running the bridge suite. Record whether direct transport, subprocess, image, security, and recovery coverage is available.
- Existing commands, from repository root: `pnpm --filter repl-web check` and `pnpm --filter repl-web test`. These establish the relevant consumer baseline, not browser-renderer or Pi compatibility.
- Source/API inspection: use the official tagged [serveStdio implementation](https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.4.0/packages/server/src/server/serveStdio.ts), [stdio exports/transport](https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.4.0/packages/server/src/stdio.ts), and [client negotiation](https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.4.0/packages/client/src/client/versionNegotiation.ts). Confirm `serveStdio(factory, { transport, legacy: "serve" })`, handle `close()`, and the modern client's `versionNegotiation: { mode: { pin: "2026-07-28" } }`. Exact selected-package declarations remain the implementation-time type authority.
- Manual: no live acceptance in this step.

Completion gate: Commands have reproducible outcomes and the migration/test seams are recorded. Existing failures are attributable and do not prevent the dependent gates from detecting regressions; otherwise stop affected work and request a bounded prerequisite decision.  
Evidence location: [evidence/step-0.1.md](evidence/step-0.1.md).

Phase exit gate: After Step 0.1, assess baseline attribution and the SDK lifecycle map. Confirm that probe disposal and actual transport close have distinct verification paths, and that no unresolved API contradiction invalidates the planned dual-era boundary. Record the assessment in Step 0.1 evidence before implementation or requesting approval to advance.

## Phase 1 — SDK v2 and dual-era serving

Outcome: The CLI speaks both eras and retains the public direct-transport API, with disposable MCP instance lifetime separated from shared helper lifetime.  
Depends on: Phase 0 exit gate.  
Review boundary: MCP dependency/API replacement and serving lifecycle. Full security/recovery matrices belong to Phase 2; focused compatibility and lifecycle proof belong with the changes here.

### Step 1.1 — Atomically migrate dependencies and existing SDK consumers

Requirements / acceptance: R1, R4, R9; AC1 (manifest and test-client type portion; packed proof in Step 3.1), AC3 (legacy baseline; dual-era comparison in Step 1.2), AC12.  
Depends on: 0.1 and Phase 0 exit.  
Review boundary: Dependency/API changes only; keep the direct legacy CLI wiring until Step 1.2.

Expected files:

- `packages/agent-bridge/package.json`, `pnpm-lock.yaml` — replace the v1 monolith with aligned v2 dependencies; client and test-only schema imports use appropriate development dependencies.
- `packages/agent-bridge/src/server.ts`, `src/bin.ts` — update SDK imports and required callback/result typing without changing tool behavior.
- `packages/agent-bridge/test/{transport,catalog,requests}.test.ts` — migrate all SDK imports/signatures atomically and add direct-attachment lifecycle assertions where missing.

Tasks:

- [ ] Replace the monolithic SDK dependency and refresh the lockfile using the repository's package manager; preserve Node >=24 and unrelated dependency versions.
- [ ] Migrate runtime and test imports, `callTool`/schema-validation signatures, and transport types together. Keep explicit result assertions rather than dropping validation to make tests compile.
- [ ] Preserve existing direct attachment and legacy initialization behavior. Add focused checks for one-time attachment, transport ownership, explicit close, repeated close, and rejection after close.
- [ ] After all consumers compile on v2, inspect remaining `@modelcontextprotocol/sdk` references and remove obsolete direct dependency/imports. Explain any remaining transitive occurrence; do not globally replace unrelated packages.
- [ ] Satisfy the verification and completion gate below and record concise evidence.

Verification:

- From `packages/agent-bridge`: `pnpm check`, then `pnpm test`. Typecheck includes `test/**/*.test.ts`, proving migrated SDK test clients compile. Existing stdio initialization, fixed catalog, image, and cancellation behavior remains exercised.
- Inspect manifests, lock importer, SDK imports, and generated declarations after the test build. Confirm runtime server dependencies and resolvable v2 `Transport` declarations, unchanged Node floor, and no v1 direct import left in the package.
- Focused direct-transport assertions use the existing `InMemoryTransport` seam in `requests.test.ts`; no new modern claim is made at this step.
- Manual: not needed for this dependency/API slice.

Completion gate: Existing bridge checks pass; direct attachment remains usable and owns its transport, and dependency/source/test changes form a coherent rollback unit. A baseline failure preventing this gate requires explicit prerequisite resolution, not a waiver counted as a pass. This gate does not establish modern support.  
Evidence location: [evidence/step-1.1.md](evidence/step-1.1.md).

### Step 1.2 — Add dual-era serving with helper-owned lifecycle

Requirements / acceptance: R2, R4, R7–R9; AC2, AC3, AC10, AC11 (transport/probe lifecycle portion; pending-work proof in Step 2.2), AC12 (retained after refactor).  
Depends on: 1.1.  
Review boundary: Server factory, CLI wiring, advisory metadata, and focused lifecycle tests are one atomic consumer change.

Expected files:

- `packages/agent-bridge/src/server.ts`, `src/bin.ts` — separate MCP instance construction from shared helper ownership and switch CLI serving.
- `packages/agent-bridge/src/mcp.ts`, `src/stdio.ts` — proposed internal construction/serving modules, added only where needed to keep the seam out of public package entry points; preserve the existing public `/server` façade. An internal implementation may be relocated into these modules as part of this slice.
- `packages/agent-bridge/test/protocol-eras.test.ts`, `test/stdio-lifecycle.test.ts` — proposed dual-era and lifecycle suites.
- `packages/agent-bridge/test/helpers/mcp.ts` — proposed shared test fixture for era selection, pairing, frame observation, and cleanup.
- `packages/agent-bridge/test/{transport,catalog,requests}.test.ts` — adapt shared setup only where needed; retain direct API regressions.

Tasks:

- [ ] Factor construction/registration of the four tools into a reusable factory against the one already-running helper. Preserve the public direct `attachMcp` path and its single-use guard; do not route every factory creation through that guard.
- [ ] Replace direct CLI transport attachment with `serveStdio` and default legacy support. Give the actual serving handle/transport final-close ownership; disposable probe-instance `onclose` must not close the helper. Release the helper on startup failure and final EOF/close without recursive shutdown.
- [ ] Preserve legacy client display metadata only as advisory information. Modern operations must not require an initialization callback; keep optional modern display metadata out of browser authority.
- [ ] Add table-driven CLI tests for explicit legacy 2025-11-25 and pinned modern 2026-07-28, asserting `getProtocolEra()`/`getNegotiatedProtocolVersion()` or equivalent wire evidence. Exercise all four tools and compare schemas/results; modern traffic must not depend on legacy `initialize`.
- [ ] Add controlled probe/discard/fallback tests before and after pairing. Use SDK transport injection with linked in-memory transports, or injectable stdio streams, and fake timers for the SDK's probe timeout in isolated in-process tests. Restore real timers before any subprocess case and in test cleanup; actual child-process EOF/cleanup checks must use real timers in a separate timer scope. Also test direct transport close; keep stdout protocol-only.
- [ ] Satisfy the verification and completion gate below and record concise evidence.

Verification:

- Proposed tests: `protocol-eras.test.ts` demonstrates both eras on the built CLI using identical CLI arguments; `stdio-lifecycle.test.ts` observes probe disposal/fallback without duplicate listeners or credential consumption, unchanged paired browser state, and full cleanup only on real final close. Tests assert no unexpected protocol frame on stdout.
- From `packages/agent-bridge`, build first with `pnpm build`, then run `pnpm exec vitest run --config ../../vitest.config.ts --root . test/protocol-eras.test.ts test/stdio-lifecycle.test.ts test/requests.test.ts test/transport.test.ts test/catalog.test.ts`; run `pnpm check`.
- Recheck existing direct-attachment tests after the factory refactor. Inject fake-clock/stream seams internally; do not add a production CLI timeout knob or a new public package entry solely for tests.
- Manual: not needed for deterministic negotiation/lifetime proof; Pi remains a later live gate.

Completion gate: Both negotiated eras perform discovery/list/describe/call, direct attachment still works, probe close is harmless to shared browser state, and actual EOF/close releases listeners. New serving code and its CLI consumer remain buildable together.  
Evidence location: [evidence/step-1.2.md](evidence/step-1.2.md).

Phase exit gate: After Step 1.2's checks, run `pnpm check` and `pnpm test` from `packages/agent-bridge`. Require legacy and pinned-modern CLI coverage, direct attachment, probe/fallback, and actual final-close checks to pass together. Inspect exports to ensure the serving refactor adds no new public package entry point. Record composition evidence in Step 1.2 before Phase 2 or approval to advance.

## Phase 2 — Request isolation and behavioral parity

Outcome: Protocol modernization does not bypass explicit browser authority or weaken request/recovery safety.  
Depends on: Phase 1 exit gate.  
Review boundary: Focused negative cases, cross-era bridge composition, and narrowly necessary adapter fixes. Do not redesign the browser protocol or application tools to satisfy tests.

### Step 2.1 — Prove stateless inputs and security boundaries

Requirements / acceptance: R2–R5, R8; AC4, AC5, AC6.  
Depends on: 1.2 and Phase 1 exit.  
Review boundary: Per-request metadata, explicit handles, validation, and pairing/ownership rejection across eras.

Expected files:

- `packages/agent-bridge/test/protocol-eras.test.ts`, `test/helpers/mcp.ts` — modern raw-frame/metadata and dual-era security cases.
- `packages/agent-bridge/test/{protocol,transport,requests}.test.ts` — reuse or parameterize relevant cases without weakening SDK-independent tests.
- `packages/agent-bridge/src/{server,mcp,stdio}.ts` — only fixes required at the new MCP boundary; do not change browser wire contracts or limits.

Tasks:

- [ ] Add modern successful-call-then-invalid-handle cases: omitted/stale session, stale catalog, unknown tool, invalid JSON arguments, and omitted arguments defaulting to `{}`. Observe browser dispatch, not only an error string.
- [ ] Vary or omit optional advisory client information and vary protocol-valid request capabilities. Assert no cross-request capability inheritance or browser authentication effect, using SDK-boundary observation where the fixed tools do not consume a capability.
- [ ] Add raw-frame cases for malformed JSON/request structure, unsupported modern revision, and missing required modern metadata. Assert SDK/spec-defined errors and unchanged pairing/session/catalog authority; invalid calls never reach a page handler.
- [ ] Exercise wrong-origin and invalid-credential pairing, second-page rejection, invalid arguments/unknown tools, and relevant over-limit frames/catalogs/images in both eras. Reuse shared browser validators and their existing boundary tests rather than duplicating every independent parser case.
- [ ] Satisfy the verification and completion gate below and record concise evidence.

Verification:

- From `packages/agent-bridge`: `pnpm build`, then `pnpm exec vitest run --config ../../vitest.config.ts --root . test/protocol-eras.test.ts test/protocol.test.ts test/results.test.ts test/transport.test.ts`, followed by `pnpm check`.
- Proposed cases must compare dispatch count and authority state before/after rejection. A modern protocol error is distinct from a bridge `isError` result. Frame tests cannot be replaced by calling application handlers directly.
- Manual: not needed; authority and dispatch observations are deterministic and local.

Completion gate: Modern operations have no implicit last-session/capability dependency; protocol-invalid and unauthorized input fails without dispatch or authority change, and both eras enforce unchanged browser guards.  
Evidence location: [evidence/step-2.1.md](evidence/step-2.1.md).

### Step 2.2 — Prove cancellation, recovery, and result parity

Requirements / acceptance: R3, R4, R6, R7; AC7 (automated text/image/revision portion; actual rendered preview in Step 3.2), AC8, AC9, AC11 (pending-work and shutdown portion).  
Depends on: 2.1.  
Review boundary: Pending browser work, late results, no replay, explicit state rotation, and result conversion.

Expected files:

- `packages/agent-bridge/test/{requests,protocol-eras,stdio-lifecycle}.test.ts`, `test/helpers/mcp.ts` — shared era cases and frame-level cancellation observation.
- `packages/agent-bridge/test/results.test.ts` — maintain envelope, MIME/base64, and image-limit checks if v2 typing requires adjustment.
- `packages/agent-bridge/src/{server,mcp,stdio}.ts` — narrowly scoped fixes to new adapter request/close handling only.
- Read only: `apps/repl-web/src/agent/__tests__/{authoring-controller,snapshot}.test.ts` and existing REPL tool contracts.

Tasks:

- [ ] Exercise MCP cancellation in both eras, observe browser abort/cancel delivery, return a late page response, and verify pending capacity can be reused. Inspect modern wire traffic through a subsequent successful-request barrier to prove no result is emitted for the cancelled ID; do not require a legacy cancellation error response on that modern request.
- [ ] Cover the real browser-request deadline through an in-process serving fixture and controlled clock, not a fake timer in a parent of a real child process. Preserve uncertainty/no-rollback semantics and ignore late results.
- [ ] Compose catalog replacement, disconnect, refresh/resume, invalid/expired resume, helper restart, and lost mutation responses with the two eras. Assert fresh handles, stale-call rejection, bounded pending cleanup, no mutation replay, and no credential/authority reuse after restart.
- [ ] Preserve text and image envelope conversion and the existing bridge-composed stale `update_sketch` regression. Compare state before/after stale rejection; synthetic image fixtures prove conversion, not actual preview capture.
- [ ] Close the real serving transport/bridge with calls pending; assert cancellation, released sockets/listeners, safe repeated close, and rejected reuse. Keep probe-close assertions separate from final-close assertions.
- [ ] Satisfy the verification and completion gate below and record concise evidence.

Verification:

- From `packages/agent-bridge`: `pnpm build`, then `pnpm exec vitest run --config ../../vitest.config.ts --root . test/requests.test.ts test/protocol-eras.test.ts test/stdio-lifecycle.test.ts test/results.test.ts`; run `pnpm check`.
- From repository root: `pnpm --filter repl-web test`. Existing authoring-controller/snapshot tests must preserve revision conflict, capture identity, cancellation, and stale-pixel behavior.
- The proposed shared fixture runs selected browser-controller composition cases against each serving era. Existing direct in-memory attachment tests remain a distinct regression path; do not label them modern simply because dependencies are v2.
- Manual: actual renderer and Pi behavior are reserved for Step 3.2.

Completion gate: Pending slots/resources are released after failure, cancellation and refresh never imply rollback or trigger replay, old handles/results are unusable, and text/image/revision behavior is preserved in both eras.  
Evidence location: [evidence/step-2.2.md](evidence/step-2.2.md).

Phase exit gate: After Step 2.2, run `pnpm check` and `pnpm test` from `packages/agent-bridge`, plus `pnpm --filter repl-web check` and `pnpm --filter repl-web test` from root. Both eras must compose with existing security, recovery, result, and REPL regressions. Record the integration result in Step 2.2 evidence before Phase 3 or approval to advance.

## Phase 3 — Installed artifacts and real client acceptance

Outcome: The packed package preserves its public surface, and actual modern/Pi connections preserve the browser workflow.  
Depends on: Phase 2 exit gate; Step 3.2 additionally requires approved live access.  
Review boundary: Package/declaration proof, user guidance, workspace compatibility, and human-assisted browser acceptance. No release/deployment work.

### Step 3.1 — Verify the installed boundary and document protocol support

Requirements / acceptance: R1, R9, R10; AC1 (remaining packed/Node/export portion), AC14.  
Depends on: 2.2 and Phase 2 exit.  
Review boundary: Published-shape artifacts and guidance, without publishing.

Expected files:

- `packages/agent-bridge/test/verify-packed.mjs` — extend existing temporary-consumer checks with installed v2 declaration/type consumption and CLI startup/negotiation coverage.
- `packages/agent-bridge/package.json`, `tsdown.config.ts` — packaging metadata/build adjustments only if needed; do not add public entry points or change flags.
- `packages/agent-bridge/README.md` — SDK/protocol/legacy/Pi distinctions, unchanged setup, direct v2 transport compatibility note.
- `apps/repl-web/README.md` — update MCP wording only where existing guidance needs clarification.

Tasks:

- [ ] Extend the isolated tarball consumer to typecheck the public server API and a compatible v2 transport with `skipLibCheck` disabled. Install an explicitly selected compiler in that disposable consumer; do not resolve compiler/types through the workspace or rely only on JavaScript imports.
- [ ] Retain optional React/Zustand-peer and SSR checks, CLI executable/flags checks, and all public entry imports. Confirm the packed installed CLI—not the source checkout—can negotiate both eras without startup import failures.
- [ ] Inspect installed runtime dependencies and generated browser/adapter declarations: server SDK dependencies resolve, test-only clients do not become accidental runtime prerequisites, browser-facing entry points introduce no SDK imports, and the Node floor remains >=24.
- [ ] Document server support versus actual client selection, legacy compatibility, unchanged `.pi/mcp.json`, and migration of consumers that construct v1 SDK transports. Make no HTTP MCP, Pi-upgrade, or live-acceptance claim before the relevant evidence exists.
- [ ] Satisfy the verification and completion gate below and record concise evidence.

Verification:

- With Node 24 active, from `packages/agent-bridge`: `pnpm check` and `pnpm test:packed`. The existing latter command builds, packs, installs into a temporary consumer with scripts disabled, and cleans up; the added type/negotiation checks are new checks, not existing guarantees.
- From root: `pnpm check`, `pnpm test`, and `pnpm --filter repl-web build`. These establish workspace consumer/type/test compatibility and production app bundling, not a rendered frame or real Pi handshake. Compare unrelated failures with baseline evidence; stop acceptance if attribution is unclear rather than declaring a green suite.
- Review README claims against both automated eras and the recorded Pi static limitation. Review generated declarations and browser dependency boundaries in the installed artifact.
- Manual: no publishing or deployment; actual renderer/client usage remains Step 3.2.

Completion gate: Node 24 packed consumers resolve/typecheck the unchanged public API and start both protocol eras, optional peers remain optional, workspace regressions are attributable, and user guidance matches the supported behavior.  
Evidence location: [evidence/step-3.1.md](evidence/step-3.1.md).

### Step 3.2 — Verify modern browser usage and installed Pi separately

Requirements / acceptance: R2, R4, R6, R10; AC7 (actual preview/revision browser portion completing Step 2.2), AC13.  
Depends on: 3.1.  
Review boundary: Approved live acceptance only; a small manual driver may expose the modern client path without changing Pi or the application.

Expected files:

- `packages/agent-bridge/test/live-mcp.mjs` — proposed opt-in modern-client driver, not collected by Vitest and not part of the CLI package entry points.
- `evidence/step-3.2.md` — sanitized client/version/negotiated-era observations and final acceptance gate.
- Read only: `.pi/mcp.json`; do not modify user/global Pi configuration or install/replace Pi.

Tasks:

- [ ] Add an explicit manual-only modern driver that launches the built CLI with the existing `--allowed-origin`/`--site-url` arguments, pins 2026-07-28, prints negotiated era/version, allows user-assisted pairing and selected calls, and closes its child on completion/failure. Present pairing information only to the local operator; never save credentials in evidence. The driver must not silently start as part of ordinary tests.
- [ ] Obtain approval/access for the live gate and use disposable browser state/sketches. Confirm the selected browser can render a preview. If the configured remote page is unavailable, record the gate as blocked; do not change the project entry or claim a local SDK test proves the configured Pi path.
- [ ] With the proposed modern driver, pair a fresh browser page, list/describe tools, read the sketch, render/apply a disposable sketch as needed, and capture its actual preview. Attempt an update using an older expected revision and compare draft/applied state before/after.
- [ ] Using installed Pi and the unchanged project stdio configuration, reconnect the helper, pair a disposable REPL page, and perform the same representative read/capture/stale-revision flow. Establish the actual negotiated legacy revision via the connection details or bounded local protocol observation, not the supported-version list alone. Do not record prompts containing secrets or pairing URLs.
- [ ] Satisfy the verification and completion gate below and record concise evidence, including the final phase/feature assessment.

Verification:

- Driver verification before live use: from `packages/agent-bridge`, `node --check test/live-mcp.mjs`; review explicit opt-in behavior, modern pin, negotiated-version output, and child cleanup. This syntax/source check is not live acceptance.
- Proposed manual command, from `packages/agent-bridge` after the driver is added: `node test/live-mcp.mjs --allowed-origin https://shdr-repl.vercel.app --site-url https://shdr-repl.vercel.app/`. The driver selects the built local CLI and modern pin internally; no server protocol flag is introduced.
- Pi setup: with user approval, start/reload Pi in this project, inspect `/mcp` and reconnect `app-mcp` to the rebuilt helper. Use existing tools through their configured exposure. Capture Pi version, actual negotiated legacy revision, successful read, actual PNG/JPEG preview content/metadata, and stale-update rejection with unchanged draft/applied state. Pi's displayed version alone is insufficient negotiation evidence.
- Run the representative read/text, actual preview capture, and stale-revision checks in both client paths. Sequentially close each helper/page to avoid confusing ownership between two separate processes. Observe final disconnect/cleanup without recording credentials.
- Manual prerequisite failure is a blocker owned by the user/environment operator. Record unavailable browser/Pi/renderer access and leave this verification task unchecked; do not substitute a packed check, fake image, or SDK client for AC13.

Completion gate: Actual modern 2026-07-28 and installed-Pi legacy connections both perform the intended browser workflow; rendered image/revision behavior is preserved and evidence identifies the client and actual protocol used. All final acceptance owners below have passed evidence; no publish/deploy action is implied.  
Evidence location: [evidence/step-3.2.md](evidence/step-3.2.md).

Phase exit gate: After Step 3.2's syntax/source check and live checks, audit the final acceptance map against Steps 1.1–3.2 evidence. Require the automated gates, packed/consumer boundary, and both live paths, distinguishing any baseline caveats. Record the final assessment in Step 3.2 evidence. Do not mark the feature accepted or request release approval while a mandatory live gate is blocked; acceptance is not publication.

## Final acceptance

| Spec acceptance ID | Owning step / gate | Verification and expected result | Evidence location |
| --- | --- | --- | --- |
| AC1 | 1.1 + 3.1; Phase 3 final audit | v2 runtime/test clients, Node 24 floor, installed declaration resolution, unchanged exports/flags, browser dependency boundary. | [1.1](evidence/step-1.1.md), [3.1](evidence/step-3.1.md) |
| AC2 | 1.2; Phase 1 exit | Pinned-modern CLI reports 2026-07-28 and exercises four tools without legacy initialization. | [1.2](evidence/step-1.2.md) |
| AC3 | 1.1 + 1.2; Phase 1 exit | Legacy 2025-11-25 retains the same CLI and tool schemas/results. | [1.1](evidence/step-1.1.md), [1.2](evidence/step-1.2.md) |
| AC4 | 2.1; Phase 2 exit | Explicit handles remain mandatory; optional identity/capability metadata does not leak authority across requests. | [2.1](evidence/step-2.1.md) |
| AC5 | 2.1; Phase 2 exit | Raw malformed/unsupported modern requests return protocol errors without browser dispatch or state change. | [2.1](evidence/step-2.1.md) |
| AC6 | 2.1; Phase 2 exit | Origin/credentials/ownership, schemas, unknown tools, and limits reject invalid operations in both eras. | [2.1](evidence/step-2.1.md) |
| AC7 | 2.2 + 3.2; Phase 3 final audit | Automated text/image/revision checks plus actual rendered preview and stale-update rejection in modern/Pi browser paths. | [2.2](evidence/step-2.2.md), [3.2](evidence/step-3.2.md) |
| AC8 | 2.2; Phase 2 exit | Handler cancellation/deadline cleanup, released capacity, ignored late results, and no post-cancel modern result. | [2.2](evidence/step-2.2.md) |
| AC9 | 2.2; Phase 2 exit | Catalog invalidation and refresh/resume require fresh handles, cancel pending work, and never replay mutations. | [2.2](evidence/step-2.2.md) |
| AC10 | 1.2; Phase 1 exit | Unpaired/paired probe disposal and fallback preserve the one shared helper and browser authority. | [1.2](evidence/step-1.2.md) |
| AC11 | 1.2 + 2.2; Phase 2 exit | Actual EOF/direct close releases all owned resources and pending calls; repeat close/reuse semantics preserved. | [1.2](evidence/step-1.2.md), [2.2](evidence/step-2.2.md) |
| AC12 | 1.1 + 1.2; Phase 1 exit | Public v2 direct transport attachment remains independently usable and single-use after factory refactor. | [1.1](evidence/step-1.1.md), [1.2](evidence/step-1.2.md) |
| AC13 | 3.2; Phase 3 final audit | Actual installed Pi works with unchanged configuration; actual legacy protocol/version is recorded. | [3.2](evidence/step-3.2.md) |
| AC14 | 3.1; Phase 3 final audit | Guidance accurately distinguishes SDK/server/client versions and unchanged setup; no HTTP/Pi-upgrade claim. | [3.1](evidence/step-3.1.md) |

Broader checks run at Phase 3, not after every edit. No acceptance row is fulfilled merely by checking its implementation tasks. Phase gates are reassessed after their final step's checks, before dependent phases or supervised approval to advance.

## Rollback and recovery

- This change migrates dependencies/code only; no persistent browser storage schema or data conversion is introduced. No irreversible publication/deployment point is included.
- Revert Step 1.1's manifest/lockfile, all runtime SDK imports, public transport typing, and affected tests together. Do not restore only the old dependency or only the old call signatures.
- Revert Step 1.2's factory/CLI/ownership wiring and its dependent dual-era fixtures together. The SDK-v2 legacy-only boundary from Step 1.1 is the fallback if modern serving fails, but it is not completion of this feature. Revert dependent Phase 2 modern-only changes with that boundary as necessary; do not leave tests asserting an unavailable protocol.
- Before deleting old direct CLI wiring, Step 1.1 proves the v2 legacy path and Step 1.2 proves its dual-era replacement. Keep public direct attachment; search for remaining consumers/imports rather than deleting compatibility APIs.
- A failed live check leaves the gate incomplete, even if packed/automated checks pass. Stop the test helper and close disposable pages; never retry an uncertain browser mutation automatically. Use a fresh helper/pairing authority after restart and reacquire session/catalog handles.
- If an implementation requires browser protocol changes, altered limits, Pi changes, or a new public entry point, stop that affected work and request a scope decision. Record only actual agreed changes in `evidence/changes.md`.

## Planned deferred checks

- Pi adoption of 2026-07-28 is outside this plan. Installed Pi must pass legacy acceptance; modern behavior is independently required from the server.
- HTTP MCP, OAuth, multi-principal hosting, modern-only compatibility, and unrelated new protocol capabilities are not implemented or claimed.
- Publication/deployment and post-release monitoring are separate decisions. This plan validates a local packed artifact and approved live usage only.

Execution-time blockers, failed/skipped/waived checks, and approved deviations belong in the predetermined evidence notes rather than mutable plan status. Do not create empty evidence notes during planning.
