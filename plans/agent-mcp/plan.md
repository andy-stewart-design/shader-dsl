# Agent MCP Bridge Implementation Plan

## Governing source

- Governing specification: [spec.md](spec.md).
- Human-facing orientation: [overview.md](overview.md).
- Pacing: the agreed five outcomes are connection proof, reusable bridge, safe REPL authoring, complete visual feedback, and hardening/packaging. A focused read-only Phase 0 establishes the execution baseline first.

This plan is an execution contract. Scope, steps, IDs, dependencies, expected files, verification definitions, completion gates, and acceptance mappings remain fixed during routine execution. A task checkbox records only that task's work was performed; it does not mean acceptance, approval, publication, deployment, or release. In supervised execution, manual approvals remain in extension state.

## Execution constraints

- Paths are relative to this repository. Preserve unrelated work; expected file lists bound each change rather than granting permission to edit other features.
- Keep step IDs stable. Routine plan edits are limited to task checkbox updates. Material changes require actual user agreement, recorded with rationale in `evidence/changes.md`; do not silently weaken the spec or retrofit this plan to implementation.
- Every completed step has a concise note at its predetermined evidence location. Record checks, outcomes, and material caveats, usually in one to three sentences or a few bullets. Do not create empty evidence notes during planning, duplicate progress tables, or append transcripts/retry diaries.
- Check a verification task only after its checks and completion gate pass and evidence exists. Failed, blocked, skipped, or waived checks remain unchecked. Record the blocker, approval owner when known, and follow-up in evidence; a waiver is not a pass.
- Run each phase exit gate after its final step's checks and before dependent phases or requesting supervised approval to advance. Record the outcome in the indicated existing step note, not as mutable plan status.
- Authoring this plan does not authorize implementation, dependency installation, browser downloads, agent configuration changes, live model calls, deployment, publication, or production changes. Execution must obtain the appropriate approval before those actions. Use temporary configurations/homes and disposable fixtures where possible.
- No Chrome extension, WebMCP, remote debugging, hosted relay, arbitrary evaluation tool, task orchestrator, or custom per-action approval UI is added. The helper is a foreground process launched by the agent, not an installed daemon.
- A real deployed HTTPS target for the Phase 1 demo app/probe, permission to serve it, and access to the target Chrome/Pi setup are prerequisites for Step 1.3. None is established by repository inspection, and no actual HTTPS URL has been supplied. The requesting user must supply an approved target and access; deployment/header changes additionally require the relevant site operator's approval. Do not invent a production URL or host configuration.
- Local test servers are verification infrastructure, not an end-user prerequisite. HTTP/fake-WebSocket tests cannot satisfy hosted HTTPS/Local Network Access gates. Synthetic images cannot satisfy real REPL canvas capture.

### Observed starting point and command discipline

Static inspection found no MCP/WebSocket bridge or direct MCP/schema-validator dependencies. The workspace already discovers `packages/*`; package conventions use `@shdr/*`, ESM, tsdown, package-local checks, and Vitest. `apps/repl-web` has `check`, `lint`, and `build`, but no package test script. The root Vitest pattern is `test/**/*.test.ts`; existing `repl-web/src/**/*.test.ts` files must not be claimed as covered by root tests.

No baseline checks were run during planning, and no green baseline is assumed. `@shdr/runtime` and `@shdr/core` have test lifecycle hooks that install Chromium. Obtain approval for downloads before invoking those lifecycle commands; do not accidentally use them as a supposedly read-only check.

Existing commands, run from repository root unless noted:

| Command | What it establishes |
| --- | --- |
| `pnpm build` | Existing workspace build via Turbo; capture unrelated baseline failures separately. |
| `pnpm check` | Existing workspace type checks, not live browser behavior. |
| `pnpm --filter repl-web check` | App TypeScript compatibility. |
| `pnpm --filter repl-web lint` | App lint compatibility. |
| `pnpm --filter repl-web build` | Production app bundle, not deployment/header correctness. |
| `pnpm --filter @shdr/runtime exec vitest run test/scheduler.test.ts --config ../../vitest.config.ts` | Existing focused scheduler test without invoking the package's browser-install lifecycle. |
| `pnpm --filter @shdr/runtime test` | Existing runtime scheduler/browser suite; its pretest may download Chromium and needs approved prerequisites. |

New commands below are **proposed additions**, not commands currently present:

| Added by | New command | Intended boundary |
| --- | --- | --- |
| 1.1 | `pnpm --filter @shdr/agent-bridge check`, `build`, `test`; `pnpm --filter agent-bridge-demo dev`, `check`, `build`, `preview` | Generic package types/build and Node tests; scaffold and serve the minimal standalone demo app. `dev`/`preview` are local serving commands, not hosted proof. |
| 1.2 | `pnpm --filter repl-web dev:preview-probe`, `build:preview-probe` | User-assisted real-canvas probe at localhost:5174 and an independently hostable build; no automated browser harness. |
| 2.3 | `pnpm --filter agent-bridge-demo check`, `lint`, `build`; package `test`, `check`, `build` when needed | Demo-app build checks plus user-assisted manual browser conformance; not a substitute for hosted permission testing. |
| 3.1 | `pnpm --filter repl-web test` | Explicit package Vitest config covering existing and new source/unit tests. |
| 3.2 | `pnpm --filter repl-web test`, `build:authoring-probe` | Existing native Node unit tests plus the manual real-editor fixture; no browser harness. |
| 5.2 | `pnpm --filter @shdr/agent-bridge test:packed` | Isolated packed/installed entrypoint and CLI checks, not publication. |

### Planning defaults for shared contracts

These finalize non-product protocol details the spec explicitly delegates to planning. Implement and test them as one shared contract; later changes require normal plan-change agreement rather than divergent site-specific behavior.

- Use one new package, `packages/agent-bridge`, named `@shdr/agent-bridge`, with explicit `/protocol`, `/browser`, and `/server` exports and a `shdr-agent-bridge` CLI. The protocol entry is environment-neutral; browser imports must not pull in Node or MCP-server code. No package publication is implied.
- Use the standard MCP SDK for stdio, `ws` for the Node WebSocket endpoint, and a browser-safe JSON-schema validator shared across boundaries. Resolve supported dependency versions during Step 1.1 and lock them; no dependency is installed during plan authoring. Reject remote schema references/loading.
- Expose `bridge_get_connection_info`, `bridge_list_tools`, `bridge_describe_tool`, and `bridge_call_tool`. Connection info returns connected session/limits or a short-lived pairing URL. Site discovery/description/calls identify `sessionId`; calls also carry the catalog version so outdated schemas fail explicitly.
- Use protocol version 1, opaque session identities, request IDs scoped to a session, and versioned catalogs. Authenticate before accepting a catalog. The page exposes handlers, not arbitrary JavaScript evaluation.
- Use the explicit result envelope `{ bridgeResultVersion: 1, content: [...], metadata?: JSON }`, with text entries `{ type: 'text', text }` and image entries `{ type: 'image', mimeType, data }`. Version 1 accepts PNG/JPEG base64, with PNG for REPL capture. Other JSON is ordinary data. Convert images to MCP image content and metadata to readable accompanying text; do not rely on structured content alone for image visibility or fetch image URLs.
- Default bounds: 5-minute pairing lifetime; 5-second first-message authentication deadline; 30-second request deadline; 4 KiB unauthenticated messages; 8 MiB authenticated messages; 4 MiB decoded bytes per image; 4 unauthenticated sockets; 8 pending calls; 64 tools and 512 KiB serialized catalog per session. Check total envelope/message size as well as per-image limits. Document effective limits in connection info; do not introduce unbounded queues. Source/schema/image-limit failures are explicit, not truncation.
- Pairing credentials use 256 bits of cryptographic randomness. Consume the initial pairing token once; keep only a short-lived, revocable resume credential in page `sessionStorage`, scoped to the exact origin, configured loopback endpoint, and session, and rotate it on successful resume. The five-minute initial pairing lifetime is unrelated to an active connection; the interrupted-transport lease is 30 seconds from disconnection and requires fresh pairing after expiry, not simply because the initial pairing link has expired. Same-origin refresh in the same tab may resume while the same helper runs, but explicit disconnect, helper termination/restart, navigation/origin change, or lease expiry ends that authority. Startup performs no port scanning. A reconnect never replays a mutation or edit.
- Bind `127.0.0.1` on port 0, validate the exact configured HTTPS origin and a configured site URL under that origin, and send credentials in the first WebSocket message. Explicitly configured HTTP `localhost`/`127.0.0.1` origins are allowed for quick manual development only; they do not satisfy the hosted gate. Pairing URL fragments are read and removed before connection; no credential in query strings or routine logs. Reject arbitrary endpoint hosts, `null`/missing Origin, and silent owner replacement.
- REPL writes use full source strings and full supplied uniform-list replacement. Wire definition fields preserve editable strings: float `{ id?, name, type: 'float', value, min, max }`, color `{ id?, name, type: 'color', value }`. Here `value` means the authored default, never a live runtime override. Reads return IDs and current editable strings, including invalid manual drafts; writes require valid supplied definitions, preserve existing valid IDs, generate IDs for additions, and derive UI color caches internally.

## Phase overview and delivery boundary

| Phase | Outcome | Dependencies | Exit gate |
| --- | --- | --- | --- |
| 0 | Reproducible baseline and known live prerequisites | Existing repository and specification | Baseline/access findings recorded; no unknown prerequisite silently assumed. |
| 1 | Safe thin hosted bridge plus early real-canvas feasibility proof | Phase 0 | The approved HTTPS demo app calls a tool and delivers an image to Pi; the separate real REPL renderer probe exports on target backends. |
| 2 | Reusable validated bridge with isolated lifecycle behavior | Phase 1 gate | The standalone unrelated demo app reads/mutates/returns images through the same package; failure/session tests compose. |
| 3 | Safe live REPL reading and authoring | Phase 2 gate | Source and definition edits are atomic, revision-checked, visible, undoable, and reachable through explicit pairing. |
| 4 | Complete visual authoring/review loop | Phase 3 gate | Pi edits, applies, receives diagnostics and the correct real preview image on the deployed REPL. |
| 5 | Hardened, installable, multi-client integration | Phase 4 gate | Lifecycle regressions, packed artifacts, and Pi/Claude Code/Codex acceptance all meet the spec. |

Delivery boundary: one feature-complete PR may contain all reviewable increments; phases are not automatically separate PRs or merge approvals. Do not represent an early probe or partial catalog as complete delivery. No publish/deploy step is automatically authorized.

Atomic groups: each listed step is a review/revert unit. Store actions and their existing callers migrate together in 3.1; editor transaction behavior and its consumers migrate together in 3.2; Apply signatures, route/editor consumers, and preview completion wiring migrate together in 4.1. Never land/revert only half of those groups. Phase 1 produces real code to extend, not a second throwaway bridge implementation.

## Phase 0 — Establish the baseline and live prerequisites

Outcome: distinguish existing failures from regressions and identify the authority/environment needed for the first gate.
Depends on: the governing spec and existing workspace.
Review boundary: read-only inspection/checks and evidence only; no bridge implementation or app fixes.

### Step 0.1 — Record reproducible baseline and access constraints

Requirements / acceptance: R1, R2, R4, R13–R16; verification prerequisites only, not acceptance completion.
Depends on: None.
Review boundary: existing tooling/state and approved verification environment.

Expected files:

- `plans/agent-mcp/evidence/step-0.1.md` — concise baseline, environment, and access findings when execution begins.

Tasks:

- [x] Inspect current worktree, manifests, build/test configs, preview/editor boundaries, and existing source tests without changing unrelated work.
- [x] Run approved existing baseline checks; record actual failures and dependency/build prerequisites without treating them as new bridge regressions or automatic waivers.
- [x] Identify the user-approved HTTPS fixture/REPL target, deployment/header owner, Chrome version, image-capable Pi setup, and browser-download/model-call permissions. Record unavailable prerequisites as blockers for affected live gates.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: existing workspace `pnpm build`/`pnpm check`, app `check`/`lint`/`build`, and the focused scheduler command above, subject to approved prerequisites. No new harness is created here. Baseline failure is recorded rather than repaired in this step.
- Manual: inspect current app editing/Apply/control behavior in an available approved environment and confirm who can authorize HTTPS/header/model checks. If access is unavailable, say so; source inspection is not a substitute.

Completion gate: baseline commands and source seams are reproducible and all live prerequisites are either established or explicitly recorded as blockers. This does not waive failed commands; affected later gates must resolve them or obtain an agreed plan change.
Evidence location: [evidence/step-0.1.md](evidence/step-0.1.md).

Phase exit gate: assess the baseline note after Step 0.1. Deterministic implementation may proceed with known prerequisites, but Step 1.3 and dependent phases cannot advance without the live access and checks they require. Record this assessment in `evidence/step-0.1.md` before supervised advancement.

## Phase 1 — Prove the direct connection before expanding it

Outcome: a narrow, authenticated end-to-end path works against hosted HTTPS, and real renderer canvas export has no hidden architectural blocker.
Depends on: Phase 0 gate; live actions additionally require its explicit access/approval prerequisites.
Review boundary: secure minimum bridge, standalone demo app, and isolated preview export helper. No REPL authoring tools, broad UI refactor, or production deployment automation.

### Step 1.1 — Build a secure thin MCP-to-page slice

Requirements / acceptance: R2–R5, R7–R9; AC2 (stdio/pairing-info portion), AC5–AC7 (transport/core security portions), AC10/AC12 (thin-path portions). Full lifecycle/results coverage belongs to Phase 2 and hosted UX to 1.3.
Depends on: 0.1.
Review boundary: one runnable package plus one minimal standalone demo app with one authenticated browser session and initial read/image calls, not a full REPL integration.

Expected files:

- `packages/agent-bridge/package.json`, `tsconfig.json`, `tsdown.config.ts`, `README.md` — new explicit exports, executable, scripts, and setup.
- `packages/agent-bridge/src/{protocol,schema,results,browser,server,bin}.ts` — minimal shared contract, validators, result conversion, transport, and CLI.
- `packages/agent-bridge/test/{protocol,transport,results}.test.ts` — deterministic generic safety/composition tests; no package-local static fixture.
- `apps/agent-bridge-demo/package.json`, `index.html`, `tsconfig*.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, and existing styles — integrate the user-scaffolded React TypeScript Vite app using only the `@shdr/agent-bridge/browser` public entrypoint, with `dev`, `check`, `build`, and `preview` scripts. The generic bridge remains framework-independent.
- `pnpm-lock.yaml` and narrowly scoped ignore/config entries if required — dependency resolution and generated-output exclusions only.

Tasks:

- [x] Add the package/entrypoints and minimal version-1 contracts using the planning defaults; select supported dependency versions and keep browser/server imports separate.
- [x] Integrate the user-scaffolded React TypeScript Vite app at `apps/agent-bridge-demo`, named `agent-bridge-demo`, with no shaders or agent harness; import `@shdr/agent-bridge/browser` and register only initial read and generated-image tools.
- [x] Implement stdio connection info, random loopback binding, exact-origin/first-message token authentication, singleton ownership, session identity, and bounded frames/authentication before accepting any catalog.
- [x] Implement generic list/describe/call with schema checks, ordinary JSON, real MCP image conversion, and keep the demo app's initial handlers harmless and application-owned. Pairing itself invokes nothing.
- [x] Keep a small generic smoke suite for loopback/stdio composition, port isolation, origin rejection, schemas, pairing behavior, and result conversion. Use user-assisted manual testing for the demo instead of building a browser harness in this step; the broader rejection/lifecycle matrix remains in Phase 2.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: package `check`, `build`, and the existing focused smoke `test`, plus demo app `check`/`lint`/`build`. Keep built-CLI text/image and generic validation smoke coverage; do not build an exhaustive browser/security harness here or claim that smoke tests establish the full later matrix.
- Manual: follow the demo README with the user: start Vite, configure Pi for the exact local origin, obtain/open a pairing link, read state, request the generated image, and disconnect/re-pair. Record the actual outcome before closing this step. Local success is not hosted/browser-policy proof; deployment needs explicit approval and the real HTTPS/model gate remains 1.3.

Completion gate: the helper/library and demo build, focused smoke checks pass, and user-assisted local pairing/read/image/disconnect has been observed. Record manual blockers honestly rather than expanding the harness. This prototype gate is not production hardening or hosted acceptance.
Evidence location: [evidence/step-1.1.md](evidence/step-1.1.md).

### Step 1.2 — Probe actual REPL renderer canvas export

Requirements / acceptance: R14, R15; AC20 (real backend export feasibility only), AC21 (encoding/export-error portion). Full applied-revision correctness belongs to 4.2.
Depends on: 0.1 and 1.1; no REPL authoring controller is assumed.
Review boundary: reusable canvas encoding utility and an isolated fixture using the existing preview factory, without exposed debug globals or a new production runtime-control API.

Expected files:

- `apps/repl-web/src/preview/capture-canvas.ts` — bounded canvas export primitive reusable in 4.2.
- `apps/repl-web/src/preview/create-preview.ts` — optional renderer-factory injection for probe-only backend selection; existing callers/default fallback are unchanged.
- `apps/repl-web/test/preview-probe/{index.html,main.ts,vite.config.ts}` — actual `createPreview`/compiler fixture, not a replacement renderer.
- `apps/repl-web/package.json`, `README.md` — manual dev/probe-build commands and usage; no Playwright dependency or browser harness.

Tasks:

- [x] Implement asynchronous bounded PNG export with explicit unsupported/encoding/limit errors and no permanent changes to playback or runtime controls.
- [x] Build a fixture from the actual preview factory and known asymmetric shader output so dimensions and nonempty/correct pixels can be checked rather than merely accepting a PNG header.
- [x] Provide manual WebGL/WebGPU selection, draw-before-export, visible capture/errors, and normal cleanup without changing production fallback rules; use user feedback rather than a new browser verifier.
- [x] Produce an independently hostable probe build; use real user hardware feedback rather than inferring support from software/headless or build results.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: `pnpm --filter repl-web check`, `lint`, `build:preview-probe`, and `build`. These prove types/lint/bundling only, not GPU pixels or export success.
- Manual: run `pnpm --filter repl-web dev:preview-probe` and open `http://localhost:5174/` on target Chrome/hardware. Select strict WebGPU and forced WebGL in turn, compare the live canvas with the exported PNG, check reported dimensions/backend, and try capture/download. Record unsupported backends or export failures rather than accepting fallback as WebGPU proof. No automated browser harness; hosted transport is still Step 1.3.

Completion gate: the existing preview rendering path exports usable images on the intended backends, or affected work stops for a transport/capture decision. No broad runtime changes are smuggled into the probe.
Evidence location: [evidence/step-1.2.md](evidence/step-1.2.md).

### Step 1.3 — Validate hosted pairing and model-visible images

Requirements / acceptance: R1, R3–R5, R9, R16; AC1/AC2/AC7 (hosted demo-app portions), AC4 (Pi demo-app portion), AC12 (live image portion). Actual REPL behavior remains owned by 3.3–5.3.
Depends on: 1.1, 1.2, and approved HTTPS/header/Chrome/Pi access.
Review boundary: live feasibility proof and minimal reproducible documentation, not production release or app integration.

Expected files:

- `packages/agent-bridge/README.md` — verified connection/setup instructions without credentials.
- `plans/agent-mcp/evidence/step-1.3.md` — hosted gate proof and material environment/permission facts.

Tasks:

- [x] Obtain explicit user/site-operator approval to serve the built demo app/probe on the supplied HTTPS origin and apply any required demo-app CSP; do not invent a hosting configuration or deploy automatically. No actual HTTPS URL is supplied by this plan.
- [x] Have Pi launch the built helper and return a pairing link through `bridge_get_connection_info`; connect Chrome to the approved hosted demo app with local app dev servers stopped.
- [x] Exercise grant/deny/reset behavior where the target browser exposes Local Network Access permission, inspect effective CSP/console failures, and verify fragment cleanup and disconnect.
- [x] Ask Pi to call the demo app's initial read/generated-image tools and describe a distinctive image it receives as actual image content; repeat canvas export on the separately hosted 1.2 preview probe so HTTP-only exports and the demo's generated image are not treated as hosted real-renderer proof.
- [x] Satisfy the verification and completion gate below, and record concise evidence without tokens or copied credential-bearing links.

Verification:

- Automated: rerun package checks/tests/builds, the demo app `check`/`build`, and the separate canvas probe checks after any fixes; no new application dependencies may be assumed.
- Manual: approved HTTPS demo app + image-capable Pi + target Chrome, no extension/debugging/local REPL server; pair, call, inspect image, deny/reset/retry permission as available, and disconnect. Record browser version, effective CSP, observable outcomes, and any actual operator approval reference, not raw secrets.

Completion gate: real deployed demo-app tool use and image perception work with acceptable connection UX; permission failure/recovery is understood, and the separate REPL renderer export gate passes. A packet trace, localhost-only demo, or unviewed base64 result does not pass.
Evidence location: [evidence/step-1.3.md](evidence/step-1.3.md).

Phase exit gate: after 1.3, compose the built helper/library with the explicitly approved HTTPS demo app and review the separate 1.2 real-renderer proof. All required checks must pass before Phase 2 or REPL authoring implementation proceeds. If browser policy, pairing, or export fails, stop and request an agreed architectural change; do not silently add an extension, TLS workaround, or unsupported-backend exception. Record the gate in `evidence/step-1.3.md`.

## Phase 2 — Establish the reusable bridge

Outcome: a generic, bounded protocol and lifecycle work beyond the initial probe.
Depends on: Phase 1 gate.
Review boundary: generic package and the unrelated standalone demo app only; no shader-authoring logic.

### Step 2.1 — Complete catalog, validation, and result contracts

Requirements / acceptance: R7–R9; AC10 and AC12 (deterministic complete portions), AC11 (catalog/frame/image bounds). Client visibility remains 5.3.
Depends on: 1.3.
Review boundary: shared validation and dispatch/result semantics; preserve the working thin transport.

Expected files:

- `packages/agent-bridge/src/{protocol,schema,results,browser,server}.ts`.
- `packages/agent-bridge/test/{protocol,results,catalog}.test.ts`.
- `packages/agent-bridge/README.md` — protocol/result/limit documentation.

Tasks:

- [x] Complete versioned catalogs, unique-name checks, explicit session/catalog arguments, schema retrieval, catalog invalidation, and validation on both helper and page boundaries.
- [x] Complete all error categories, text/JSON/image metadata handling, bounded catalogs/messages/images, and rejection of unsupported envelope versions/MIME/base64 or remote schema/image loading.
- [x] Test removed/unknown tools, stale catalogs, malformed messages, nested argument validation, plain-object/envelope distinction, and boundary-size outcomes without invoking handlers on rejection.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: package `test`, `check`, `build`; verify image blocks coexist with readable metadata, limits are reported consistently, and neither validator nor converter fetches external resources.
- Manual: unnecessary for this deterministic increment; subsequent conformance/client gates provide live proof.

Completion gate: published discovery contracts and dispatch/result behavior agree across both endpoints; negative cases leave handler state unchanged and remain bounded.
Evidence location: [evidence/step-2.1.md](evidence/step-2.1.md).

### Step 2.2 — Isolate sessions and uncertain request outcomes

Requirements / acceptance: R5, R6, R8, R16, R17; AC8/AC9/AC11/AC24 (generic lifecycle portions). Application recovery is completed in 5.1.
Depends on: 2.1.
Review boundary: session/request lifecycle and resource cleanup, not agent task tracking.

Expected files:

- `packages/agent-bridge/src/{session,browser,server,protocol}.ts`.
- `packages/agent-bridge/test/{sessions,requests,transport}.test.ts`.
- `packages/agent-bridge/README.md` — uncertainty/reconnect semantics.

Tasks:

- [x] Implement ownership leases, scoped `sessionStorage` resume/rotation, explicit revocation and clearing, fresh page/catalog identity on refresh, bounded reconnect/backoff, and per-tab singleton ownership. Resume only the exact origin/session/loopback endpoint; do not scan ports or persist sketch/source/runtime state.
- [x] Complete request deadlines/cancellation, finite pending/unauthenticated limits, catalog teardown, process/socket cleanup, and stale-response rejection with no automatic mutation or edit replay.
- [x] Add modest focused fake-clock/loopback tests using the existing seams for second tabs/helpers, token/resume reuse, same-origin refresh without a new link, reconnect races, expiry, shutdown, explicit-disconnect clearing, helper restart requiring pairing, late results, and an already-executing mutation whose response is lost.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: package `test`, `check`, `build`; prove a late response cannot satisfy another request/session, a second owner cannot replace the first, same-origin refresh resumes only with scoped `sessionStorage` authorization, explicit disconnect clears/revokes it, helper restart and expired leases require fresh pairing, resources settle at deadlines, and an uncertain mutation is reported as uncertain rather than rolled back or replayed.
- Manual: no client behavior is inferred from these tests; the AC24 browser happy/negative flow is exercised in 2.3 and the composed recovery regression is exercised in 5.1.

Completion gate: ownership, teardown, refresh resume, revocation, and uncertainty semantics compose under failure without leaked authority or unbounded pending work. This is the Step 2.2 owner for the generic AC24 lifecycle contract; conformance evidence is completed in 2.3 at [evidence/step-2.3.md](evidence/step-2.3.md).
Evidence location: [evidence/step-2.2.md](evidence/step-2.2.md).

### Step 2.3 — Prove reuse with an unrelated conformance page

Requirements / acceptance: R2, R3, R7, R9, R16, R17; AC3, AC7 (generic browser portion), AC8/AC9/AC24 (browser-library portions).
Depends on: 2.2.
Review boundary: the standalone non-shader demo app and generic public-library usability, verified by focused checks and user-assisted manual browser conformance.

Expected files:

- `apps/agent-bridge-demo/src/App.tsx`, `src/App.css` — add the harmless text-state mutation and minimal visible state/result treatment while retaining initial read/generated-image tools and existing styling.
- `apps/agent-bridge-demo/README.md` — supported tools and the focused manual conformance recipe.
- `packages/agent-bridge/README.md`.

Tasks:

- [x] Add a simple text-state mutation to the standalone demo app, retaining its read and generated-image tools, through only the public `@shdr/agent-bridge/browser` entrypoint.
- [x] Document the supported tools and focused manual flow: read/set/image, same-URL refresh, explicit disconnect, helper restart, and an interrupted delayed mutation with no replay; do not add a browser harness or persistence.
- [x] Demonstrate the unrelated demo app through the same helper without shader-specific code changes and inspect generic package imports for application coupling; the generic package must not depend on the app at runtime.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: demo app `check`, `lint`, and `build`; package `test`, `check`, and `build` when the bridge changes or consumer proof is needed. These are static/package checks, not browser conformance proof.
- Manual: user-assisted conformance against the approved hosted demo target (or an explicitly approved replacement): pair, read state, set/read the message, inspect the distinctive image, refresh the same origin without a new link, then test explicit disconnect plus refresh staying unpaired, helper restart requiring fresh pairing, and an interrupted mutation not being replayed while catalog/page identity is refreshed. Verify no REPL-specific bridge modifications were needed.

Completion gate: AC3's unrelated-site read/mutation/model-visible image works through the same library/helper, and the AC24 manual happy/negative flow is recorded in this existing 2.3 evidence location. Automated checks do not substitute for the pending user-assisted flow.
Evidence location: [evidence/step-2.3.md](evidence/step-2.3.md).

Phase exit gate: run the package unit/build checks when needed, the demo app `check`/`lint`/`build`, and the unrelated hosted conformance journey after 2.3. Review generic source boundaries and session failure evidence together. Record the result in `evidence/step-2.3.md` before Phase 3; automated checks alone do not replace live invocation/image proof.

## Phase 3 — Enable safe REPL authoring

Outcome: a paired agent can inspect and coherently edit the live draft without bypassing CodeMirror or overwriting manual work.
Depends on: Phase 2 gate.
Review boundary: authoring state, editor integration, and read/update tools. Manual Run remains functional; awaitable agent Apply/capture arrives in Phase 4.

### Step 3.1 — Add revisioned atomic draft commands and definition schemas

Requirements / acceptance: R10–R12; AC13 (draft-read portion), AC14/AC15 (store/definition portions), AC16 (manual definition revision portion).
Depends on: 2.3.
Review boundary: atomic migration of draft actions and existing manual callers; new remote commands are not exposed before editor consistency exists.

Expected files:

- `apps/repl-web/src/stores/draft.ts`, `src/shared/uniforms.ts`.
- `apps/repl-web/src/agent/{authoring-schema,authoring-controller}.ts` — definition wire mapping and transactional command boundary.
- `apps/repl-web/src/components/uniforms-pane/index.tsx`, `helpers.ts`, and `definitions.ts` — existing CRUD/validation consumers only; preserve supported manual authoring behavior.
- `apps/repl-web/src/stores/draft.test.ts`, `src/agent/authoring-controller.test.ts`, relevant existing uniform tests.
- `apps/repl-web/package.json`, `src/agent/authoring-schema.json` — package-local native Node test script and published JSON schema; no Vitest wiring is needed because the existing source tests already use `node:test` and Node 24 runs the TypeScript sources directly.

Tasks:

- [x] Add draft revisions and a synchronous commit boundary, routing all existing source/definition/manual actions through consistent revision semantics without introducing Apply or runtime changes.
- [x] Implement semantic definition wire mapping, raw invalid-draft reads, generated/preserved IDs, derived color caches, complete supplied-list replacement, and existing float/color validation.
- [x] Validate the full requested command before committing; reject stale revisions and invalid supplied definitions atomically while preserving omitted fields and permitting uncompiled source edits.
- [x] Add package-local test coverage for existing source tests plus omission, invalid/stale updates, ID handling, raw drafts, and revision behavior; do not claim root test coverage.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: new app `test`, existing `check`/`lint`/`build`. Observe store subscribers during a multi-field command and assert no partially committed authoring state; negative requests change no field. Existing manual action tests remain green.
- Manual: check normal source/definition editing and Run still work; no remote command is registered yet, so a store-only write cannot masquerade as completed editor integration.

Completion gate: the store/schema changes and every affected manual caller form a buildable atomic group with tested all-or-nothing behavior. New source mutation entrypoints remain inaccessible remotely until 3.2–3.3.
Evidence location: [evidence/step-3.1.md](evidence/step-3.1.md).

### Step 3.2 — Integrate visible undoable editor transactions

Requirements / acceptance: R11, R12; AC14/AC15/AC16 (controller/editor complete portions).
Depends on: 3.1.
Review boundary: editor handle/consumers and coherent command dispatch, not transport or compilation refactoring.

Expected files:

- `apps/repl-web/src/editor/{create-editor,extensions,authoring-adapter}.ts`, `src/hooks/use-code-editor.ts`.
- `apps/repl-web/src/components/editor-pane/code-editor/index.tsx`.
- `apps/repl-web/src/agent/authoring-controller.ts`, `src/editor/create-editor.test.ts`, related controller/editor tests.
- `apps/repl-web/test/authoring-probe/{index.html,main.ts,vite.config.ts}`, `package.json` — small manual Vite fixture and scoped dev/build scripts; no browser harness.

Tasks:

- [x] Expose controlled document read/replace readiness through the editor handle and hook; route programmatic edits through history-preserving CodeMirror transactions.
- [x] Coordinate both mounted documents with the atomic authoring command, suppressing intermediate store notifications/feedback loops and rejecting commands before mutation if an editor cannot participate.
- [x] Track manual edits and undo/redo as real draft changes; maintain coherent final revisions and leave omitted documents untouched.
- [x] Add real CodeMirror `EditorState` history/annotation checks, injectable multi-document ports, failure/unready/conflict tests, and a manual fixture using actual `EditorView` instances for visible source-plus-definition updates and undo/redo.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: existing app `test` (native Node 24 `node:test`), `check`, `lint`, `build`, and the scoped `build:authoring-probe`. The unit suite checks real CodeMirror history annotations/undo/redo plus injectable multi-document preflight, one-notification atomicity, rollback, conflict, and failure behavior; it does not claim DOM visibility.
- Manual: run `dev:authoring-probe` at `http://localhost:5175/`, edit main/utils, use **Apply sample agent edit**, **Undo main**, **Redo main**, **Try stale conflict**, and **Unmount/Mount utils**. Confirm visible text, one coherent revision, conflict/no-op behavior, and unmount rejection. No transport/debug-global dependency is required for production.

Completion gate: a real editor/controller command is visible, undoable, revision-safe, and coherent across fields. Handle contracts and their hook/component consumers land/revert together.
Evidence location: [evidence/step-3.2.md](evidence/step-3.2.md).

### Step 3.3 — Pair the deployed REPL and expose authoring tools

Requirements / acceptance: R1–R3, R10–R12, R15, R16; AC1/AC7 (REPL portions), AC13 (context/read portion), AC14–AC16 (live integration portions), AC22 (connection/catalog boundary portion).
Depends on: 3.2.
Review boundary: application provider, connection affordance, context/read/update registration, and approved deployment integration; no placeholder Apply/capture handlers.

Expected files:

- `apps/repl-web/src/agent/{provider,tools,context}.ts` and `src/agent/authoring-controller.ts`.
- `apps/repl-web/src/components/agent-connection/index.tsx`, supporting connection hook.
- `apps/repl-web/src/routes/index.tsx`, `package.json`, `README.md`.
- `apps/repl-web/test/authoring-probe/*`, agent provider tests; `pnpm-lock.yaml` for the workspace dependency.

Tasks:

- [x] Add lifecycle-safe provider registration for `get_authoring_context`, `get_sketch`, and `update_sketch`, wired to completed authoring commands rather than direct independent setters.
- [x] Supply curated language/uniform/Apply context, raw draft reads, and honest current preview status; do not invent applied revision certainty before Phase 4 wires it.
- [x] Add token/link entry, status, permission/error recovery, fragment/history cleanup, and disconnect; guard browser-only work from SSR, preserve normal unpaired app behavior, and test that credentials never enter durable storage or ordinary helper/app logs and telemetry.
- [x] Document the effective deployed CSP requirement; use only an approved host/header change, not an invented host-specific config or blanket production deployment.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: the existing native Node 24 app tests (`node --test --experimental-strip-types 'src/**/*.test.ts'`) cover the provider-independent tool/context boundary and controller results; run app `check`, `lint`, and `build` plus generic package regression tests. Verify no forbidden tools are advertised and SSR/build imports stay browser-safe. No browser harness is promised for this step.
- Manual: approved deployed REPL, no local app server: pair through Pi, inspect context, author main/utils and definition changes, undo, provoke a manual-edit conflict, and disconnect without losing the draft. Inspect the active URL/history entry, Web Storage and other bridge persistence, ordinary helper/app logs, and telemetry requests to verify credentials are removed/not retained or leaked. Manual Run remains usable; undispatched Phase 4 capabilities are not advertised. This user-assisted check remains pending until recorded in `evidence/step-3.3.md`.

Completion gate: live authoring works through the generic package with visible connection status and no approval harness, persistence operations, runtime setters, or debug evaluation.
Evidence location: [evidence/step-3.3.md](evidence/step-3.3.md).

Phase exit gate: after 3.3, run app unit/browser/check/lint/build and generic package regressions, then the deployed authoring/conflict/undo journey. Record the integrated outcome in `evidence/step-3.3.md`. Phase 4 depends on actual editor consistency, not a store-only mutation demo.

## Phase 4 — Complete visual authoring and review

Outcome: agent Apply and capture form a revision-correlated visual feedback loop.
Depends on: Phase 3 gate.
Review boundary: compilation/rendering completion and snapshots; preserve shader semantics, manual controls, and fallback policy.

### Step 4.1 — Make Apply await compile, install, and draw

Requirements / acceptance: R10, R13, R15; AC13 (diagnostic/applied identity portion), AC17/AC18, AC19 (Apply portion), AC22 (existing Apply effects portion).
Depends on: 3.3.
Review boundary: atomic migration of Apply/preview completion contracts and all consumers, with structured diagnostics retained.

Expected files:

- `apps/repl-web/src/agent/{apply-controller,tools,authoring-controller}.ts`.
- `apps/repl-web/src/hooks/{use-shdr-compilation,use-shdr-preview}.ts`.
- `apps/repl-web/src/preview/create-preview.ts`, `src/routes/index.tsx`, affected editor/preview/status consumers.
- `apps/repl-web/src/compiler/compile-shdr-body.ts` only for preserving existing diagnostic data, not language changes.
- Apply/controller tests and the manual `apps/repl-web/test/authoring-probe` fixture.

Tasks:

- [x] Snapshot expected draft revisions and preserve document/range and backend/kind diagnostics; expose `apply_sketch`/`get_diagnostics` only with their real contracts.
- [x] Wire explicit compile/install/draw states, attempt identity, and last successfully applied revision through hook/controller/renderer completion rather than React state-update timing.
- [x] Preserve the installed preview on compile/replacement failure, reject stale Apply before installation, and reject superseded completions without overwriting newer status.
- [x] Migrate manual Run and all affected consumers atomically; retain existing reset-to-definition-default behavior and fallback rules.
- [x] Add deferred/fake-renderer race tests and real-renderer checks for current-draft divergence, compile failure, runtime failure, draw completion, disposal, and supersession.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: app `test`/`check`/`lint`/`build` plus the manual authoring-probe build. Delay install/draw and assert Apply remains pending; verify old preview and identity survive failures; superseded callbacks cannot become current success. Run the existing focused scheduler regression if scheduling seams are touched.
- Manual: Pi applies valid/invalid deployed drafts while a user makes a newer edit; observe precise revision outcomes, unchanged manual controls, and documented successful-Apply defaults. No image correlation is inferred until 4.2.

Completion gate: compile, install, and draw are independently observable, errors preserve the correct previous preview, and manual/agent paths share the same completed behavior without half-migrated consumers.
Evidence location: [evidence/step-4.1.md](evidence/step-4.1.md).

### Step 4.2 — Capture the correct preview and close the loop

Requirements / acceptance: R1, R9, R10, R11, R12, R13, R14; AC19 (capture portion), AC20/AC21, AC23 (core deployed Pi loop).
Depends on: 4.1 and the successful 1.2 backend export gate.
Review boundary: production snapshot integration and full feedback proof, reusing the earlier encoder rather than substituting viewport capture.

Expected files:

- `apps/repl-web/src/agent/{snapshot,tools,apply-controller}.ts`.
- `apps/repl-web/src/preview/capture-canvas.ts`, `src/hooks/use-shdr-preview.ts`, provider wiring as needed.
- Snapshot/race tests, the manual `apps/repl-web/test/authoring-probe` fixture, and the existing manual preview probe.

Tasks:

- [ ] Register `capture_preview` against the active renderer handle and a draw/export boundary, with expected applied revision guarding before and after capture.
- [ ] Return the shared image envelope and consistent applied revision, backend, actual dimensions, and read-only uniform snapshot; do not expose runtime setters or permanent playback changes.
- [ ] Test missing/tainted/disposed canvases, export/size errors, resize/backend replacement, and apply-during-capture without returning stale or mislabeled success.
- [ ] Extend the real app browser journey and run Pi's deployed source/definition edit, Apply, diagnose, inspect-image, and review loop on the supported renderer backends.
- [ ] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: app unit/browser/check/lint/build and `build:preview-probe`, plus generic result-conversion regressions. The existing preview probe remains user-assisted; test-only backend injection cannot change production fallback semantics or become a tool.
- Manual: real deployed REPL and target Chrome/Pi, with local app servers stopped: change a visually distinctive sketch and definitions, Apply, request guarded capture, and have Pi describe the actual image. Check backend/dimensions/revision metadata and both backend exports; unsupported hardware is a blocker, not a pass.

Completion gate: Pi can complete AC23's core loop and AC20/AC21's capture behaviors hold, including real model-visible images from the application canvas rather than the whole tab.
Evidence location: [evidence/step-4.2.md](evidence/step-4.2.md).

Phase exit gate: rerun integrated app/generic checks and the full deployed Pi visual journey after 4.2. Review Apply races, canvas identity, and backend proof together; record the result in `evidence/step-4.2.md` before Phase 5. Broader installation/client claims remain unproven until Phase 5.

## Phase 5 — Harden, package, and verify supported clients

Outcome: the demonstrated workflow survives realistic failure and works from an installed artifact across the declared clients.
Depends on: Phase 4 gate.
Review boundary: integration regressions, artifact boundaries, compatibility documentation, and acceptance; no new application capabilities or publication.

### Step 5.1 — Exercise failure recovery and unchanged behavior end to end

Requirements / acceptance: R3–R8, R12–R17; AC5–AC11 (composite complete portions), AC15/AC16/AC18/AC19/AC21/AC22/AC24 (integrated regression portions).
Depends on: 4.2.
Review boundary: close integration gaps in existing helper/library/provider code with focused regression tests; no new transport or authorization model.

Expected files:

- Existing `packages/agent-bridge/src/*` and protocol/session/browser tests only for demonstrated integration defects.
- Existing `apps/repl-web/src/agent/*`, editor/preview integration only for demonstrated defects.
- `apps/repl-web/test/authoring-probe` and focused regression tests.

Tasks:

- [ ] Exercise two helpers/tabs, credential expiration/reuse, same-origin refresh resume, mid-update/mid-Apply disconnect, navigation, explicit disconnect, helper shutdown/restart, reconnection leases, and stale late responses against real page state.
- [ ] Assert loss of a response does not replay a mutation or claim rollback; refresh creates fresh catalog/page identity and agents reread actual app state before further authoring, while cached revisions are not trusted merely because resume succeeded.
- [ ] Verify pairing/read/disconnect leave the current draft and runtime controls unchanged. Refresh restores only the connection and retains normal app reload behavior without adding sketch/source/runtime persistence; catalog exclusions remain intact and failed captures/Apply never mislabel an older preview.
- [ ] Add regression tests with fixes, then run relevant existing workspace/runtime regressions at this major boundary with approved browser prerequisites.
- [ ] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: generic package targeted unit/check/build commands, demo app `check`/`lint`/`build`, REPL app unit/browser/check/lint/build commands, workspace `pnpm check`/`pnpm build`, and existing `pnpm --filter @shdr/runtime test` with approved download/browser prerequisites. Compare baseline failures explicitly; an unexplained failure or an unapproved waiver cannot close this gate.
- Manual: deployed REPL recovery with pending edits/Apply/capture, same-origin refresh resume, browser permission denial/retry, explicit disconnect plus refresh, helper restart, and disconnect while manual controls differ from defaults. Confirm only the scoped resume credential uses `sessionStorage`; there is no sketch/source/runtime persistence or forbidden tool.

Completion gate: safety/failure criteria hold in the composed application, not just mocks, and required regressions pass or the gate remains blocked for explicit resolution.
Evidence location: [evidence/step-5.1.md](evidence/step-5.1.md).

### Step 5.2 — Verify the packed helper and browser artifact boundaries

Requirements / acceptance: R1, R2, R4, R9; AC4 (artifact prerequisite), AC5/AC12 (installed-runtime portions).
Depends on: 5.1.
Review boundary: runnable packaging and isolated consumption, not registry publication or permanent machine installation.

Expected files:

- `packages/agent-bridge/package.json`, `tsdown.config.ts`, `src/bin.ts`, `README.md`.
- `packages/agent-bridge/test/verify-packed.mjs`, package scripts and boundary tests.

Tasks:

- [ ] Finalize executable metadata, built files, explicit browser/server/protocol exports, supported Node environment, and artifact-only runtime dependencies.
- [ ] Add an isolated temporary consumer check that packs the package, installs the tarball with approved dependency access, runs its CLI through MCP, and bundles/imports the public browser entry without repository-source fallbacks.
- [ ] Verify the artifact excludes credentials, test fixtures, and accidental app code, and browser output contains no Node-only modules or server dependencies.
- [ ] Document reproducible artifact-based agent configuration and cleanup without publishing or installing a daemon/global configuration.
- [ ] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: package `check`/`build`/`test` and proposed `test:packed`. In an isolated temporary directory, the installed executable must serve MCP, bind/authenticate correctly, and return a real image block; browser consumption must work independently of workspace source aliases.
- Manual: inspect temporary-install cleanup and generated instructions. A workspace import or direct source command is not installed-artifact proof.

Completion gate: the actual distributed tarball shape, CLI, and browser entry work independently of the repository checkout; nothing is published or permanently installed.
Evidence location: [evidence/step-5.2.md](evidence/step-5.2.md).

### Step 5.3 — Verify client compatibility and final deployed acceptance

Requirements / acceptance: R1–R17; AC1/AC2/AC4/AC7/AC12/AC13/AC20/AC22/AC23/AC24 (final human-facing portions, including actual model-visible image delivery for AC12); other criteria use the owning gates below.
Depends on: 5.2 and approved image-capable Pi/Claude Code/Codex plus hosted access.
Review boundary: client configuration examples, final live compatibility proof, and concise user documentation; no client-specific bridge fork.

Expected files:

- `packages/agent-bridge/README.md`, `apps/repl-web/README.md` — setup, limits, trust model, pairing, failure recovery, and explicit exclusions.
- `plans/agent-mcp/evidence/step-5.3.md` — compatibility and final acceptance evidence; omit secrets and sensitive prompts.

Tasks:

- [ ] Provide actual Pi, Claude Code, and Codex MCP configurations for the same installed helper and explicit allowed site; use temporary configuration where possible and obtain approval before persistent changes.
- [ ] Verify each client launches the helper, obtains pairing info, discovers/calls tools, receives readable errors/metadata, and passes an image to its configured image-capable model.
- [ ] Re-run Pi's full deployed authoring/review journey including definition CRUD, conflict handling, diagnostics, real preview capture, and unchanged excluded controls; no local REPL server or extra per-action approval UX.
- [ ] Audit the final acceptance mapping and documentation against actual artifact/host behavior; record blocked or missing client/hardware access instead of claiming compatibility.
- [ ] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: final package/app builds, unit/browser tests, artifact verification, and applicable regression checks from 5.1 after any compatibility fix.
- Manual: with explicit live/model/config approval, run the same installed helper against the deployed site from Pi, Claude Code, and Codex one at a time. Verify the model can identify distinctive image content rather than merely seeing base64, and recovery instructions match observed permission/session failures.

Completion gate: all three clients meet AC4 through the same implementation, Pi meets the complete deployed AC23 journey, and no mapped acceptance gate is failed, skipped, or silently waived. Missing access blocks this gate rather than expanding scope or inventing results.
Evidence location: [evidence/step-5.3.md](evidence/step-5.3.md).

Phase exit gate: after 5.3, assess all owning acceptance gates below, packed artifacts, required regressions, and the live client/REPL journeys. Record final integrated acceptance in `evidence/step-5.3.md` with links to earlier proof instead of duplicating logs. This gate does not authorize publication, production deployment, or merge.

## Final acceptance

Each row identifies the full owning gate; partial checks listed in earlier steps do not independently satisfy the whole criterion. Evidence links are predetermined and are created only when execution produces results or blockers.

| Spec acceptance ID | Owning step / gate | Verification and expected result | Evidence location |
| --- | --- | --- | --- |
| AC1 | 3.3 plus 5.3 final deployed gate | Normal hosted REPL use and explicit pairing work without local app server/extension/debugging or automatic edits. | [step-3.3](evidence/step-3.3.md), [step-5.3](evidence/step-5.3.md) |
| AC2 | 1.3 plus 5.3 final client gate | MCP-provided pairing info, real HTTPS/CSP/local-network denial and retry behavior work without breaking the site. | [step-1.3](evidence/step-1.3.md), [step-5.3](evidence/step-5.3.md) |
| AC3 | Phase 2 exit / 2.3 | The standalone unrelated demo app reads, mutates, and delivers an image to the model without bridge changes. | [step-2.3](evidence/step-2.3.md) |
| AC4 | 5.2 artifact gate and 5.3 client gate | Same installed helper works with Pi, Claude Code, and Codex including model-visible images. | [step-5.2](evidence/step-5.2.md), [step-5.3](evidence/step-5.3.md) |
| AC5 | 1.1/2.2 transport proof, composed in 5.1 | Two helpers get isolated loopback ports; stdout/logging remain safe. | [step-1.1](evidence/step-1.1.md), [step-2.2](evidence/step-2.2.md), [step-5.1](evidence/step-5.1.md) |
| AC6 | 1.1/2.1 rejection proof, composed in 5.1 | Wrong origin/token and pre-auth calls never gain authority or change state. | [step-1.1](evidence/step-1.1.md), [step-2.1](evidence/step-2.1.md), [step-5.1](evidence/step-5.1.md) |
| AC7 | 3.3 and final 5.3 browser check | Initial pairing credentials are removed from the fragment and absent from logs/durable storage; only scoped resume credentials may remain in sessionStorage. | [step-3.3](evidence/step-3.3.md), [step-5.3](evidence/step-5.3.md) |
| AC8 | 2.2/2.3 lifecycle proof, composed in 5.1 | A second owner cannot replace the first; disconnect/re-pair preserves draft with new identity. | [step-2.2](evidence/step-2.2.md), [step-2.3](evidence/step-2.3.md), [step-5.1](evidence/step-5.1.md) |
| AC9 | 2.2/2.3 lifecycle proof, composed in 5.1 | Same-origin refresh may resume only with valid scoped authorization; navigation/disconnect/helper restart/expiry and late messages do not transfer authority or fabricate success. | [step-2.2](evidence/step-2.2.md), [step-2.3](evidence/step-2.3.md), [step-5.1](evidence/step-5.1.md) |
| AC10 | 2.1, composed in 5.1 | Current session/catalog/schema is enforced before handler mutation. | [step-2.1](evidence/step-2.1.md), [step-5.1](evidence/step-5.1.md) |
| AC11 | 2.1/2.2 bounds proof, composed in 5.1 | Resource/time limits, cancellation uncertainty, and no mutation replay hold. | [step-2.1](evidence/step-2.1.md), [step-2.2](evidence/step-2.2.md), [step-5.1](evidence/step-5.1.md) |
| AC12 | 2.1 conversion, 5.2 installed proof, and 5.3 live model gate | JSON and image envelopes convert correctly; malformed content fails without fetching URLs; configured clients/models actually receive and inspect the image. | [step-2.1](evidence/step-2.1.md), [step-5.2](evidence/step-5.2.md), [step-5.3](evidence/step-5.3.md) |
| AC13 | 3.3/4.1, confirmed in 5.3 | Context/draft/applied/diagnostic reads are useful, accurate, and nonmutating. | [step-3.3](evidence/step-3.3.md), [step-4.1](evidence/step-4.1.md), [step-5.3](evidence/step-5.3.md) |
| AC14 | Phase 3 exit / 3.3 | Real source-plus-definition updates commit coherently and preserve omitted fields. | [step-3.1](evidence/step-3.1.md), [step-3.2](evidence/step-3.2.md), [step-3.3](evidence/step-3.3.md) |
| AC15 | 3.1/3.2, regression in 5.1 | Invalid/stale multi-field requests change nothing and explain rejection. | [step-3.1](evidence/step-3.1.md), [step-3.2](evidence/step-3.2.md), [step-5.1](evidence/step-5.1.md) |
| AC16 | 3.2, regression in 5.1 | Visible undo/redo/manual changes stay consistent and invalidate old revisions. | [step-3.2](evidence/step-3.2.md), [step-5.1](evidence/step-5.1.md) |
| AC17 | 4.1 | Delayed compile/install/draw cannot produce premature visual readiness. | [step-4.1](evidence/step-4.1.md) |
| AC18 | 4.1, regression in 5.1 | Failed/stale Apply retains the previous preview and structured failure identity. | [step-4.1](evidence/step-4.1.md), [step-5.1](evidence/step-5.1.md) |
| AC19 | 4.1/4.2, regression in 5.1 | Superseded Apply/capture never overwrites or mislabels current output. | [step-4.1](evidence/step-4.1.md), [step-4.2](evidence/step-4.2.md), [step-5.1](evidence/step-5.1.md) |
| AC20 | 4.2, confirmed in 5.3 | Actual WebGL/WebGPU preview images reach the model with correct metadata, not viewport substitution. | [step-1.2](evidence/step-1.2.md), [step-4.2](evidence/step-4.2.md), [step-5.3](evidence/step-5.3.md) |
| AC21 | 4.2, regression in 5.1 | Missing/mismatched/unexportable/oversized capture fails explicitly. | [step-4.2](evidence/step-4.2.md), [step-5.1](evidence/step-5.1.md) |
| AC22 | 3.3/4.1 boundaries, final 5.1/5.3 checks | No excluded capabilities; connection/read/disconnect preserve controls and Apply preserves documented defaults behavior. | [step-3.3](evidence/step-3.3.md), [step-4.1](evidence/step-4.1.md), [step-5.1](evidence/step-5.1.md), [step-5.3](evidence/step-5.3.md) |
| AC23 | Phase 4 core loop and Phase 5 final gate | Pi completes deployed authoring/definition editing/Apply/diagnose/visual review through the installed integration. | [step-4.2](evidence/step-4.2.md), [step-5.3](evidence/step-5.3.md) |
| AC24 | Phase 2.2 lifecycle contract, 2.3 manual conformance, regression in 5.1 | Pair once, resume after same-origin refresh without a new link, reread fresh page/catalog state, and reject resume after explicit disconnect/helper restart/expiry; interrupted mutations are not replayed. | [step-2.2](evidence/step-2.2.md), [step-2.3](evidence/step-2.3.md), [step-5.1](evidence/step-5.1.md) |

Final gates do not replace focused tests with a single broad green command. A successful build, fake renderer, standalone demo app, installed artifact, and live model journey prove different things. All required owning gates must be assessed; any blocked, skipped, or failed gate remains uncompleted and is reported in its evidence note.

## Rollback and recovery

- All changes are reversible code/config increments; no persistent sketch migration or publication is included. Preserve the developer's live draft before any manual test reload/navigation, using approved manual copying rather than inventing a save feature.
- Revert each step with its associated contract consumers/tests. In particular, do not split the 3.1 store/caller migration, 3.2 editor/caller migration, or 4.1 Apply/preview/caller migration. Revert dependent consumers before removing shared package exports or dependencies.
- The generic package/probes can remain disconnected while REPL integration is reverted. Removing the connection provider must leave manual sketching and Run functional. Remove dependencies only after checking remaining imports/configurations.
- To recover from helper failure, terminate/restart the helper, revoke the session, and pair afresh. Do not reuse logged/copied credentials or replay pending writes. After refresh/resume or an uncertain mutation, rediscover the catalog and reread draft/applied revisions before deciding what to retry.
- Deployment/CSP/config rollback belongs to the approved site operator and must restore the actual previous policy, not a guessed default. Agent configuration tests use isolated settings where possible and restore any explicitly approved persistent changes.
- Packing/temp installs are disposable verification artifacts, not release points. Any future publication, permanent installation, or production rollout requires separate authorization and its own recovery considerations.

## Planned deferred checks

- Safari/Firefox, other browser versions, and enterprise policy environments beyond the selected target are outside this plan; do not imply support from Chrome results.
- WebMCP/extension/debugging transports, cross-machine access, simultaneous multi-agent editing, durable pairing/account trust beyond the browser tab/session, and deterministic animation/GPU readback remain deferred per the spec.
- Registry publication and production rollout are not gates in this plan. Packed/installed and approved hosted acceptance are required, but do not grant release authority.
- No spec acceptance criterion is intentionally deferred. Missing hosted access, browser/backend support, model/client availability, or installation approval blocks its owning gate; it is not converted into completed acceptance.

Execution-time blockers, skipped or waived checks, and accepted deviations belong in the predetermined evidence notes rather than mutable plan fields. Stop affected work and obtain agreement before changing the governing contract.
