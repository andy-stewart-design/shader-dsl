# Plan changes

## Standalone Phase 1 demo app

User direction: “Let's plan on doing a simple, standalone vite app. Can we spin that up as part of phase 1?” The plan carries this direction forward by including a small standalone Vite demo app in Phase 1 and reusing it later for generic bridge conformance, rather than maintaining package-local connection/conformance fixtures.

The user approved planning a standalone app in Phase 1. Naming and implementation defaults are `apps/agent-bridge-demo` (package name `agent-bridge-demo`), minimal vanilla TypeScript Vite, and the `@shdr/agent-bridge/browser` public entrypoint; these details are not separately interviewed product decisions. Step 1.1 now plans its scaffold with initial read and generated-image tools and `dev`/`check`/`build`/`preview` scripts; Step 2.3 adds a simple mutation and makes the app's `test:browser` the conformance/browser harness. Generic helper unit/transport/result tests remain package-local and app-independent. The separate real-REPL renderer capture probe in Step 1.2 is unchanged.

Affected plan surfaces: the Step 1.1 and 2.3 expected-file lists, proposed command table, verification commands, Phase 1/2 gates, hosted demo-app checks in Step 1.3, and AC3/final evidence wording. The obsolete package `build:fixtures`, package fixture paths, and package browser-fixture harness were removed; app `check`/`build` and app `test:browser` are used instead. Hosting/deployment of the built app remains subject to explicit user/site-operator approval, and no actual HTTPS URL has been supplied.

This initial note records approval to change the plan only; execution was authorized later as described below. It did not itself authorize deployment, publishing, or commits.

## React scaffold and manual-first Step 1.1

The user supplied a React Vite scaffold and answered “yes” when asked whether to keep React and update the vanilla-TypeScript plan detail. The browser library remains framework-independent; only the demo uses React. The user then authorized finishing repo integration and open Step 1.1 implementation.

During execution the user clarified: “I am here to help with manual testing” and “We need to speed this up and we need to keep this quick and dirty.” Step 1.1 now retains its existing small smoke suite and uses a short user-assisted pairing/read/image/disconnect check rather than expanding automated browser/security coverage. Broader contract/lifecycle cases remain in Phase 2; no hosted or production acceptance is waived. Implementation tasks may be checked while the manual completion gate remains open.

For practical local iteration, the implementation accepts explicitly configured HTTP origins only for `localhost`/`127.0.0.1`, retaining exact-origin and token checks. This is a development aid selected for the manual-first workflow, not a claim that the user separately approved an insecure public deployment; all other origins still require HTTPS, and the deployed HTTPS gate is unchanged.

## Manual-first Step 1.2

The user's instruction to keep this quick and dirty and help with manual testing carries into their request, “ok, let's do 1.2.” Replace the planned Playwright verifier with a small manual Vite probe (`dev:preview-probe`) using the actual REPL compiler/preview factory. Retain type/lint/app/probe build checks and require user-observed WebGPU/WebGL export results before closing the gate. No browser dependency, harness, or download is added. The optional factory-injection seam selects backends only inside the fixture and preserves production defaults; hosted proof remains Step 1.3. Remove later references to the superseded verifier rather than promising a nonexistent command.

## Same-origin refresh resume contract

The user asked when refresh persistence should be implemented; the recommendation was Phase 2, Step 2.2, with `sessionStorage` resume before Step 2.3 conformance. When asked whether the plan/spec needed updating, the user replied: “do it”. This records agreement to update the governing plan/spec only; it does not authorize implementation, publishing, deployment, or MCP configuration changes.

The agreed behavior is a short-lived, revocable resume credential in `sessionStorage` after one initial pairing. A same-origin refresh in the same tab may reconnect automatically while the same helper is running, without a fresh pairing link. Explicit disconnect clears and revokes it; helper restart, navigation/origin change, or expiry requires fresh pairing. The initial five-minute pairing link remains unrelated to an active connection, and the existing 30-second transport-resume lease may remain. Refresh creates fresh page/catalog identity, requires rediscovery and rereading, does not transfer or replay in-flight calls/edits, and is not sketch/source/runtime persistence. The credential is not the original pairing token, is not treated as proof of a physical tab, and is not placed in localStorage, cookies, URLs, logs, or durable account trust.

The scope rationale is protocol correctness and lifecycle recovery in 2.2 before the 2.3 manual conformance flow, not Phase 3 authoring implementation. Existing historical evidence, including earlier refresh/re-pair observations, remains accurate for the policy tested at that time; this note records the changed future policy only. No new harness, extension, relay, approval system, or embedded-agent architecture is introduced.

## Manual-first Step 2.3

The user explicitly asked, “Is 2.3 when we'll do manual testing?” and then confirmed, “ok, let's do 2.3”. This authorizes the bounded Step 2.3 demo implementation and user-assisted manual-first verification only: no approval was invented for later phases, deployment, or MCP configuration changes. The planned demo browser harness and `test:browser` command are removed; package checks plus demo check/lint/build and the user's hosted/manual conformance flow are the verification boundary.

## Step 3.2 manual-first verification adjustment

The user's current Step 3.2 request reiterates the global manual-first/quick workflow and asks for a practical browser exercise without starting Step 3.3. Accordingly, the proposed `test:browser`/`verify-authoring.mjs` harness references were replaced with the existing native Node 24 unit tests, real CodeMirror `EditorState` history checks, and a small `dev:authoring-probe`/`build:authoring-probe` fixture at `http://localhost:5175/`. The fixture uses the actual `createEditor`, adapter, registry, and controller with two visible editors and buttons for apply, undo/redo, stale conflict, and unmount/mount. This changes verification method only; it does not invent a publish, deployment, MCP, provider, or approval decision, and the final DOM/manual checkbox remains open.

## Step 3.3 manual-first verification adjustment

The user authorized Step 3.3 with the same quick/manual-first method and explicitly reserved deployed Pi/MCP checks for user assistance. The planned browser-harness wording was therefore implemented as native Node authoring-tool/provider-boundary tests plus app `check`/`lint`/`build`; `plans/agent-mcp/evidence/step-3.3.md` records the exact pending deployed workflow instead of claiming approval or browser evidence. The production REPL remains Nitro/TanStack Start rather than a guessed static deployment, and no deployment or Pi configuration write was performed by this implementation.

## Step 4.1 tool boundary clarification

Step 4.1 keeps the existing three authoring tools and adds only `apply_sketch` when the production renderer-backed Apply operation exists. Correlated diagnostics and applied identity are returned by `apply_sketch` and reflected in `get_sketch`/`get_authoring_context`; no separate `get_diagnostics` tool or Phase 4.2 capture/runtime tool was added. This follows the execution handoff's explicit narrow catalog boundary while retaining structured diagnostics.

## Step 4.2 approved backend-verification method

For final Step 4.2 hosted verification, the user explicitly approved Zen Firefox as the alternative backend test after the method was clarified. The evidence therefore uses Chrome WebGPU plus user-assisted Zen Firefox WebGL2 with WebGPU disabled, rather than pretending both backends were tested in Chrome or claiming automated browser pixels. This records a verification-method clarification only; it changes no contract, scope, backend policy, or Phase 5 status.

## Step 4.2 bounded preview capture default

The user explicitly approved lowering the default capture resolution: “Yeah, I think it makes sense to default to a lower resolution capture to be safe”. Step 4.2 now uses optional `maxDimension` (integer 64–2048 or explicit `"native"`), defaults to 512 at the `capture_preview`/production port boundary, and keeps the generic `captureCanvas` helper's native default for the standalone probe. Metadata distinguishes encoded PNG `width`/`height` from native `identity` and `canvasWidth`/`canvasHeight`; no provider payload root cause or deployment approval is inferred.
