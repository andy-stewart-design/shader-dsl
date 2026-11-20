# Step 5.1 — Recovery and unchanged-behavior verification

Status: **Step 5.1 is complete**. The focused regression was fixed as a test-state bug, the approved runtime suite passed, and the composed hosted/manual gate is now closed. Step 5.2 and later steps remain unchecked and unstarted.

## Scope and change

- Added one small composed regression to `packages/agent-bridge/test/requests.test.ts`.
- It runs the real bridge server, real browser bridge client, actual REPL `createDraftStore`/`createAuthoringController`/`createAuthoringTools` services, and MCP call path. The test drops the response after an `update_sketch` commit, verifies the mutation ran once and the outcome is uncertain, resumes with a fresh session/page identity, rereads the current sketch, and verifies a stale revision cannot replay a second mutation. It also asserts the composed catalog remains the three-tool authoring surface when Apply/capture ports are absent.
- For that focused regression, no production source fix was justified; the one-line test correction removes a premature replacement with the old artifact before the recovery pixel assertion. No redeploy is needed for this test-only change.

Root cause was test state, not a runtime binding bug. The recovery case correctly awaited `setShader(changed)`, called `resetUniforms()`, and drew the new defaults, but then immediately called `setShader(initial)` before the outer `pixels()` assertion. That successful install submitted the old defaults (`a=0.2`, `b=0.5`, `c=0.6`), producing `[51,128,153,255]`; the assertion was intended to inspect the already-completed Apply recovery frame (`a=0.3`, `b=0.25`, `c=0.6`). Runtime semantics are unchanged and intentional: explicit `setUniforms` overrides persist across compatible replacement, while the app's successful Apply boundary explicitly resets them. The later explicit `initial` replacement still exercises creation overrides not carrying forward.

Existing coverage was reused rather than duplicated: generic bridge lifecycle/lease/owner/catalog/cancellation/transport/result coverage remains 7 files, now **34 tests** (previously 33); the native REPL suite remains **80/80**. Existing app Apply/capture/controller tests cover synchronous run-to-completion, failed Apply preservation, identity replacement, cancellation/deadlines, and capture failure categories.

## Checks

Passed:

- `pnpm --filter @shdr/agent-bridge test` — **34/34**, 7 files.
- `pnpm --filter @shdr/agent-bridge check` and `build` — pass.
- `pnpm --filter repl-web test` — **80/80** native Node 24 tests.
- `pnpm --filter repl-web check`, `lint`, `build`, `build:preview-probe`, and `build:authoring-probe` — pass (run earlier in this pass; app build retains existing dependency `use client` warnings and preview probe retains its existing chunk-size warning).
- `pnpm --filter @shdr/runtime check` and `build` — pass when run serially.
- `pnpm check` — pass when rerun serially after builds completed.
- `pnpm build` — pass.
- `git diff --check` — pass.

The first parallel `pnpm check`/`pnpm build` invocation produced a transient `@shdr/runtime` check failure because its check raced the build while the build was cleaning/recreating `dist`; the serial rerun passed. This is not an unexplained source failure. Baseline warnings remain the known TypeScript 7 experimental API, dependency `use client`, and probe/chunk warnings recorded in Step 0.1; no new warning class was observed.

Historical first authorized run: with the user's explicit approval (“sure”) recorded for the Chromium download and existing browser launch, `pnpm --filter @shdr/runtime test` was run exactly from the repository root. `pretest` (`playwright install chromium`) completed without an installer error. The scheduler stage passed **7/7**. `node test/verify-browser.mjs` launched headless Chromium and completed its WebGL/WebGPU verifier, reporting owned WebGL/WebGPU first frames, Display-P3/sRGB fallback and resize preservation, vector arithmetic/color swizzles, opaque alpha, bindings, manual inputs, playing pause/resume, failed/stale installs, loss, disposal, and isolated bundles.

The historical chain then failed in the existing `node test/verify-uniforms.mjs` regression at line 289: `same-schema Apply recovery uses the new defaults on both pixel paths #gl: 51,128,153,255 vs 0.3,0.25,0.6,1`. Therefore the later verifiers did not run in that invocation, and no runtime-suite pass was claimed from it. The WebGPU half of that `pixels` assertion was not reached after the WebGL assertion failed; the headless verifier's SwiftShader/unsafe flags are not manual hardware-GPU proof. No runtime script reported a skip reason or warning; `verify-browser` emitted a summary rather than a numeric case count.

Actual browser details: Playwright **1.63.0**, cached Chromium revision directory **1243**, launched binary **Google Chrome for Testing 153.0.8010.12**. The focused failing test is `verify-uniforms.mjs:272-291`; relevant state/install implementation is `packages/runtime/src/uniforms.ts` plus the existing WebGL/WebGPU `setShader` paths. No speculative production fix or assertion relaxation was made.

Read-only browser prerequisite result: `/Applications/Zen.app/Contents/MacOS/zen` exists and is executable. Standard `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, the user Chrome path, Chrome Canary path, and `google-chrome`/`chromium`/`zen` PATH commands were absent except for the Zen application path. No hosted browser was configured by this worker; the approved Playwright-managed test browser launch is recorded above.

## Authorized rerun after the test-state fix

- `node packages/runtime/test/verify-uniforms.mjs` — pass. It verified WebGL and presented WebGPU custom-uniform pixels, generated-name isolation, f32 arithmetic, updates, resets, replacement, validation, and isolation.
- `node --check packages/runtime/test/verify-uniforms.mjs` — pass.
- `pnpm --filter @shdr/runtime check` — pass.
- `pnpm --filter @shdr/runtime test` — pass end to end: scheduler **7/7**; `verify-browser`; `verify-uniforms`; `verify-textures`; `verify-mix-step`; `verify-pr3-math`; `verify-orbit-math`; `verify-square-matrices` (**102** rendered cases plus **2** transposition guards); `verify-horizon-burn`; `verify-plasma`; `verify-references` (all reported WebGL/presented-WebGPU comparisons); and `verify-fragment-derivatives` (**14/14** authored derivative passes on both backends). Every listed pixel verifier reported WebGL and presented WebGPU output where applicable. No verifier reported a skip or unsupported-backend pass. The run used Playwright **1.63.0**, Chromium revision directory **1243**, Chrome for Testing **153.0.8010.12**, with the existing SwiftShader/unsafe flags; it is not physical-GPU proof.

At this historical checkpoint this closed the automated regression investigation only. The production app did not need redeployment for that test-state correction; subsequent browser-client navigation fixes and their hosted retest are recorded below.

## Historical open manual gate (superseded)

With the focused runtime regression resolved and no production redeploy required for this test-only change, use the deployed URL with local servers stopped:

1. Pair one fresh tab and confirm the exact five-tool catalog. Change a non-default runtime control; read context/sketch, then pair/read/disconnect and confirm the draft and runtime control are unchanged.
2. Refresh that same origin/tab. Confirm connection-only resume, a new page/session identity, fresh catalog, and reread of actual app state. Confirm normal reload resets draft/runtime state and only the scoped resume credential is in `sessionStorage`.
3. Reuse an expired/old pairing or resume credential and confirm rejection; explicit disconnect must revoke it. Do not use a second window against the same Pi session.
4. During real Apply/capture/update calls, interrupt the connection or navigate away. Record uncertain outcomes honestly: no automatic replay, no claimed rollback, no stale/older preview metadata. Reconnect/restart the helper and reread before any retry.
5. Repeat the recovery check with the approved Chrome WebGPU path and the existing Zen WebGL2 path if available. Unsupported hardware or unavailable Chrome is a blocker, not a pass.

The material blocked gates are the user-assisted real deployed page-state checks above and the two-helper/tabs/navigation/helper-restart observations. No Phase 5 closure or Step 5.2 work is claimed.

## Navigation/Back investigation and focused fix

The deployed failure sequence was: one connected original tab was taken to `about:blank` and then Back; the user reported it remained unpaired after waiting and refreshing. The exact interval before the parent queried status was not recorded, so an already-expired 30-second lease cannot be ruled out for that manual attempt. Source inspection nevertheless proved a deterministic lifecycle defect: `pagehide` unconditionally marked the controller terminal, released ownership, disabled resume, and had no `pageshow` recovery path. A BFCache return therefore could not resume the existing document even within the known lease; this did not justify increasing the lease or inventing automatic pairing.

The minimal production fix is in `packages/agent-bridge/src/browser.ts`: persisted `pagehide` now drops the socket and pending work while retaining the same document owner and scoped resume grant; persisted `pageshow` performs one fresh-session/catalog resume attempt within the existing lease, with bounded existing retry/expiry handling. Non-persisted unload, explicit disconnect, credential rotation, lease expiry, and fresh reload behavior remain terminal/unchanged. `packages/agent-bridge/test/requests.test.ts` now exercises the production browser controller against the real WebSocket server with a fake window event target and the actual REPL authoring controller/store: `pagehide({persisted:true})` interrupts an active request, the request settles uncertainly without replay, `pageshow({persisted:true})` returns with a new session/catalog and rotated credential, the draft/store remains unchanged, and a reread still works. Bridge coverage is now **36 tests** (7 files); the native REPL suite remains **80/80**. The focused matrix also asserts explicit disconnect before a persisted lifecycle does not revive the page.

Focused verification passed: `pnpm --filter @shdr/agent-bridge test`, `check`, and `build`; `pnpm --filter repl-web test`, `check`, `lint`, and `build`; and serial `pnpm --filter agent-bridge-demo check`, `lint`, and `build`. `git diff --check` passed. A first parallel demo check raced the bridge package's cleaning build and failed only because the generated workspace package types were temporarily absent; the serial rerun passed. Existing warnings remain only the known TypeScript experimental API and app dependency `use client` bundle warnings. Because the browser client bundle changed, the deployed REPL needs an app rebuild/redeploy; the running helper server needs no restart because the wire protocol is unchanged.

### Historical hosted navigation retest pending (superseded)

After deploying the rebuilt REPL (with the current helper still running), pair one tab, confirm draft/runtime/pause state, navigate that original tab to `about:blank`, then use Back within **10 seconds** and observe the same tab. Confirm it reconnects once within the 30-second helper lease, receives a fresh session/catalog, and preserves the BFCache document's draft/runtime/pause state. Also test double pagehide/unload idempotence, an explicit disconnect before Back (must stay disconnected), and a deliberately expired lease (must clear stale resume and require fresh pairing). Record the timing/status immediately before navigation and after Back; do not use a second tab or expose credentials. A normal same-origin refresh remains the separate fresh-load reset/reread case.

## Historical navigation retest failure and deterministic root cause

The prior BFCache patch's automated result was not a hosted proof. The user's current retest used Helium/Chromium at `https://shdr-repl.vercel.app/` with the unchanged helper/origin. After a fresh deployed client was paired, the parent appended `// Navigation recovery check: keep this cached draft.` (revision 1), then the user closed DevTools, paused, navigated the same tab to `about:blank`, and used Back within the requested window. The marker disappeared and the page remained paused/unpaired. Read-only console data was exactly:

```json
{
  "navigation": "back_forward",
  "hasResumeRecord": false,
  "cacheReasons": ["masked"]
}
```

`masked` does not identify a browser-cache cause. Source tracing of the real production path (the REPL `AgentProvider` creates the production bridge after editor readiness; it does not own a separate full-page disposal cleanup) found the deterministic failure: non-persisted `pagehide` tears down the old socket but intentionally leaves the scoped resume grant for a new document; the new document then read the grant but the constructor only allowed `navigation.type === "reload"` and otherwise called `clearGrant()`. A `back_forward` history document therefore deleted its valid resume credential before it could authenticate. This explains both `hasResumeRecord: false` and the fresh default app state; it does not implicate BFCache eligibility, headers, Helium settings, or the server lease. The unrecorded delay means lease expiry remains a separate possibility for that particular attempt, but the source defect is deterministic and independently reproduced below.

The minimal fix in `packages/agent-bridge/src/browser.ts` admits `reload` and `back_forward` as new-document resume navigations while retaining the exact origin/page URL, existing 30-second lease, bounded retry, ownership protection, explicit-disconnect revocation, and ordinary-navigation clearing behavior. No persisted-pageshow-only behavior, new protocol, storage of draft/runtime state, or capability was added. `packages/agent-bridge/test/requests.test.ts` now drives the production browser client and real bridge server through an explicit `beforeunload -> pagehide({persisted:false}) -> unload` sequence, verifies the grant survives the old document, creates a new `back_forward` document with the same sessionStorage, authenticates with a fresh session/catalog, and composes the actual REPL draft store/controller/tools to verify fresh default app state and the three-tool catalog. Existing refresh, BFCache, explicit disconnect, expiry, conflict, transport-loss, and no-replay regressions remain active.

Verification after this fix: `pnpm --filter @shdr/agent-bridge test` — **37/37** across 7 files; `pnpm --filter @shdr/agent-bridge check` — pass; `pnpm --filter repl-web test` — **80/80**; `pnpm --filter repl-web check`, `lint`, and `build` — pass; `pnpm --filter agent-bridge-demo check`, `lint`, and `build` — pass; `git diff --check` — pass. Build output retained only the known TypeScript 7 experimental API and dependency `use client` warnings. The changed browser client requires a REPL rebuild/redeploy; the helper does not require restart because the wire protocol is unchanged.

### Historical hosted retest pending (superseded)

This was fixed at the source and covered on the real server/client seam; at that historical point the hosted gate remained open. Smallest next step: redeploy the rebuilt REPL, keep the existing helper running, pair one Helium tab, record `get_connection_info` immediately before navigation, navigate that same tab to `about:blank`, press Back within 10 seconds, and poll connection status for the full 30-second lease without refreshing. Expected result in either branch is a fresh bridge session/catalog and reconnection: a persisted BFCache return keeps in-memory draft/runtime/pause state, while the observed noncached `back_forward` path correctly starts fresh app state (marker loss is expected) but must still resume the connection. If it fails, record the exact `performance` navigation type, resume-record presence, and first WS/error/permission message before another code change.

## Historical paused checkpoint — manual progress (superseded)

This records the intermediate pause point, before the four remaining manual groups were completed. It is retained for provenance; Step 5.1 is no longer open.

Completed on the deployed REPL:

- A manually edited, unapplied draft and paused preview with live `recoveryLevel` approximately 0.346 (authored default 0.8) survived reads, capture, explicit disconnect, and fresh pairing in the same document. MCP sketch snapshots and captured runtime uniform values matched before/after; the user confirmed pause/control preservation.
- Same-origin refresh resumed with a fresh session/catalog and normal default draft/runtime reset. An attempted write using the old session, even with the fresh page's current revision, returned `stale_session` and left the fresh sketch unchanged.
- The user confirmed the current URL had no pairing token and bridge storage contained only the scoped resume record, not pairing credentials, draft source, or runtime values.
- Duplicating the tab left the original connected and the duplicate not connected. MCP confirmed the original session still owned the helper and its draft was unchanged; no claim is made that the duplicate actually submitted an authentication request.
- After redeploying the `back_forward` fix, the user repeated navigation to `about:blank` and Back within the requested window and reported automatic reconnection. MCP confirmed a new session, the five-tool catalog, and fresh default draft at revision 0. This supersedes the preceding hosted-retest-pending status for that history-navigation case.
- Explicit disconnect followed by refresh stayed disconnected; the user confirmed the resume record was absent, and the helper reported unpaired.
- An expired, previously unused pairing link (observed more than an hour earlier) and a previously consumed pairing link were both rejected with Needs attention. The helper remained unpaired.

Exactly four manual scenario groups remain:

1. Helper shutdown/restart and fresh pairing without losing the existing page's draft/runtime state.
2. Two independent helpers and their tabs remaining isolated (distinct from the completed single-helper duplicate-tab check).
3. Interruption of pending update/Apply/capture calls, with honest uncertain outcomes, no replay, and no stale preview claims; composed automated coverage already passes, but the deployed interruption observations remain pending.
4. Browser permission denial followed by recovery/retry on the deployed site.

Then reconcile the remaining task checkboxes and final evidence, with only relevant rechecks if later fixes require them. No Step 5.2 work has started. The last observed helper state was unpaired; on resumption rediscover connection/session/catalog state and obtain a fresh pairing link if needed. Do not reuse links or cached identities from this checkpoint. Keep credentials out of evidence. The separate intermittent Pi/Codex 400 remains unresolved; retained temporary diagnostics are outside the repository.

## Final hosted manual closure

The following supersedes the paused checkpoint and closes the Step 5.1 manual gate. These are user-observed results from the latest deployed Helium/Chromium run; no new manual cases were added beyond the frozen four groups and governing plan.

1. **Helper restart/re-pair:** The page was left with authored `draft4`, an unsaved comment, `applied1`, and the live runtime value `0.29730504587156` against the authored default `0.8`. After the user stopped the old helper, started a new one, and pasted a fresh pairing link in the same tab without refresh, the new helper was initially unpaired; after re-pairing, MCP returned the exact baseline sketch (including the comment/definitions and `applied1`) and the exact runtime uniform snapshot. The helper port/session changed. Pause preservation was part of the instructed flow, but no new pause-button value was reported; no such observation is claimed here.
2. **Two helpers/tabs:** The original helper/tab and a separately started helper in a new conversation and REPL tab were connected simultaneously. The second helper's tab received only its `// second helper isolation` edit. The original helper's pre-edit and post-edit reads showed only its own `// original helper isolation` marker, unchanged session ownership, and no second-helper marker. The user then exited the second Pi and closed its tab while the original remained connected.
3. **Permission denial/retry:** Helium site settings initially denied Local network and Apps on device. Reload/reset behaved normally, a fresh link showed Needs attention, and the helper stayed unpaired. After the user restored Apps on device to Ask and the prior Local network setting, retrying Connect produced the expected permission prompt; approval yielded a new session, the five-tool catalog, and the default revision-0 sketch. No draft-preservation claim is made for this intentional reload/reset.
4. **Interrupted calls:** A user-scoped, one-shot WebSocket send interceptor dropped the next three response frames only and restored the original send automatically. The parent issued actual `update_sketch`, `apply_sketch`, and `capture_preview` calls; all three were still pending after the waits, and the user's screenshot showed three held test-reply entries (`text`, `text`, `image`) plus the orange editor/preview markers while the old connection was refused. After terminating only the helper, all three actual MCP promises rejected with `MCP connection closed`. There was no retry, rollback, duplicate mutation, or stale-image claim. After recovery, a fresh helper/session reread the sketch and catalog; a fresh capture returned current `applied1`/`draft1` metadata and an image, not a withheld stale image. The interrupted fault was intentional response-loss after the operation's commit/draw/PNG work, not a claim of cancellation inside atomic commit or compilation.

The earlier navigation failures and both narrow browser-client fixes are retained in the historical sections above. The final hosted back/forward retest passed: the user reported reconnection, and root MCP confirmed a new session, catalog of five, and fresh default draft. No force-cache/header change or physical BFCache-path claim is made. Same-origin refresh, explicit disconnect, stale-session rejection, duplicate-tab ownership, expired/consumed-link rejection, scoped-storage behavior, and unchanged draft/runtime behavior are covered by the preceding hosted observations and approved existing regressions.

## Verification and status reconciliation

Existing approved runs are cited here, not rerun for this documentation closure: bridge **37/37** tests across 7 files; REPL **80/80** native tests; bridge/app/demo checks, lint/builds, serial workspace `pnpm check`/`pnpm build`; and the full `@shdr/runtime` suite (scheduler **7/7**, browser verifiers, uniforms, textures, math, matrices, horizon/plasma/references, and derivatives **14/14**) all passed. The latest generic-client navigation fixes also passed the scoped bridge checks and app/demo checks before the hosted retest. `git diff --check` passes. No source changes followed those runs.

All five Step 5.1 plan tasks and the completion gate are now checked. Step 5.2, Step 5.3, and the Phase 5 exit gate remain unchecked and unstarted. The separate intermittent Pi/Codex HTTP 400 limitation remains unresolved and is not a Step 5.1 feature claim.
