# Agent MCP Bridge Specification

## Status

- Readiness: Ready for planning.
- Blocking decisions: None identified. Hosted-browser connectivity, pairing UX, and image delivery are technical validation gates before committing to the full integration; they have not been demonstrated.
- Overview: [overview.md](overview.md).
- Source: The feature-scoping conversation accompanying this specification, including the agreed direct page-to-helper proposal. This specification supersedes the earlier extension, Chrome DevTools MCP, and `pi-webmcp` fork proposals.
- Evidence boundary: Repository findings below are from static source inspection only. No application, browser, MCP-client, or deployment verification was performed to author these documents. Readiness is document readiness, not implementation or deployment authorization.

## Problem and intended outcome

A developer using an external coding agent should be able to ask that agent to author or review a sketch in an already-open, deployed shader REPL. The agent needs meaningful application operations, not brittle editor DOM automation: inspect source and uniform definitions, make coherent edits, apply them, understand diagnostics, and inspect the rendered result as an image.

The intended outcome is a request-driven authoring loop in the same tab the developer uses. The site remains hosted normally; the agent launches a small local MCP helper, and the page explicitly pairs with it over a loopback WebSocket. The helper and browser client library are reusable across sites, while each site implements its own tools.

The central invariant is that the bridge exposes only declared application capabilities. It is neither a general browser controller nor an agent harness. Pairing enables communication; it does not itself start authoring work.

## Scope

Included:

- A generic local helper exposing standard MCP over stdio and an authenticated loopback WebSocket connection to a page.
- A generic browser client library for schema-described asynchronous tools, result envelopes, and connection lifecycle.
- A minimal connection affordance in the deployed REPL: pair, inspect connection status, and disconnect.
- Pi as the required first client, with the same standard MCP implementation usable by Claude Code and Codex.
- REPL tools for authoring context, main/utils source and uniform-definition reads/updates, compile/apply, diagnostics, and canvas capture.
- Draft/applied revision tracking, concurrent-edit protection, visible undoable source changes, and model-visible image results.
- A small unrelated second-site conformance page demonstrating read, mutation, and image capabilities without bridge changes, as proposed in the direct-approach outline; this is not a second production-site integration.

Non-goals:

- Chrome extensions, remote debugging, Chrome DevTools MCP, WebMCP, or a hosted relay as dependencies of this version.
- A local development server or local copy of the REPL as a prerequisite for using the deployed site.
- Embedded agents, background autonomous work, task orchestration, custom per-action approval, or an agent permission replacement.
- Arbitrary script evaluation, arbitrary browser navigation, filesystem access, or automation of sites that have not integrated the client library.
- Direct manipulation of live uniform values, playback, animation time, mouse input, or other runtime controls.
- Sketch save/delete/publish operations, cross-machine connections, simultaneous agents editing one tab, or persistent pairing across page reloads.
- Deterministic animation playback, raw GPU readback guarantees, or browser support beyond the initial validated Chrome configuration.

## Current behavior and evidence

All paths are relative to this repository. These are observed source facts, not claims of runtime verification.

| Source                                                                                                           | Current behavior and relevance                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/repl-web/src/routes/index.tsx`                                                                             | Composes editor and preview around the compilation hook; a suitable application-level boundary for connecting an authoring provider.                                                                                                                       |
| `apps/repl-web/src/stores/draft.ts`                                                                              | Holds main source, utils source, and uniform drafts. Independent setters exist, but no draft revision or atomic multi-field authoring command exists.                                                                                                      |
| `apps/repl-web/src/hooks/use-code-editor.ts`, `src/editor/create-editor.ts`, `src/editor/extensions.ts`          | CodeMirror owns the live document; initial source is initialization-only. History is enabled, but the exposed handle does not provide agent-facing document updates. Store writes alone are insufficient.                                                  |
| `apps/repl-web/src/shared/uniforms.ts`                                                                           | Uniform drafts have stable UI IDs. Float drafts hold name/value/min/max fields; color drafts hold name and color editing/cache fields. Authoring definitions are separate from source documents.                                                           |
| `apps/repl-web/src/components/uniforms-pane/index.tsx`, `helpers.ts`, `definitions.ts`                           | Existing definition CRUD and validation cover supported float/color types, identifiers, duplicates/reserved names, finite f32 values, ranges, and color values. These capabilities are distinct from runtime value controls.                               |
| `apps/repl-web/src/compiler/compile-shdr-body.ts`                                                                | Combines generated uniform declarations, utils, and main, with document/range-aware diagnostics.                                                                                                                                                           |
| `apps/repl-web/src/hooks/use-shdr-compilation.ts`                                                                | Apply is explicit. Compilation failure preserves the previous artifact; successful compilation snapshots uniform definitions. The public Apply operation is not an awaitable compile/install/draw result, and displayed errors flatten richer diagnostics. |
| `apps/repl-web/src/hooks/use-shdr-preview.ts`                                                                    | Coordinates asynchronous shader replacement and stale-result rejection. Successful Apply resets runtime values to definition defaults; replacement failure preserves/restores the previous installed preview state.                                        |
| `apps/repl-web/src/preview/create-preview.ts`, `packages/runtime/src/webgl.ts`, `packages/runtime/src/webgpu.ts` | Preview handles expose canvas/backend and asynchronous installation/draw primitives. WebGPU is preferred, with limited WebGL fallback. No supported application snapshot operation exists; canvas export needs browser verification.                       |
| `packages/runtime/src/errors.ts`, `packages/runtime/README.md`                                                   | Runtime errors carry backend/kind information and the renderer has explicit installation/lifecycle semantics worth preserving.                                                                                                                             |
| `apps/repl-web/src/components/editor-pane/editor-header/index.tsx`                                               | Save is not an implemented persistence API. No agent bridge or persistence workflow was found in the inspected app.                                                                                                                                        |

Preserve explicit Apply, existing manual editing/runtime controls, supported shader/uniform semantics, renderer fallback policy, and failure preservation. Deliberate changes are an authoring API, connection UI, revisions, awaitable completion, and snapshots; they are not a redesign of the shader language or preview controls.

## Requirements and invariants

- **R1 — Deployed-site workflow:** A user can pair an already-open deployed HTTPS REPL with an agent-launched local helper without running the REPL locally. The unpaired site retains normal behavior.
- **R2 — Generic, portable integration:** The helper and browser library contain no shader-specific tool names, editor selectors, or application state logic. Pi is supported first; Claude Code and Codex use the same standard MCP interface. An unrelated integrated site works without bridge modifications.
- **R3 — Explicit connection, normal agent behavior:** Pairing is a user action and exposes only registered tools. It triggers no tool handler or authoring mutation by itself. There is no arbitrary evaluation capability or custom per-action approval system.
- **R4 — Transport and discoverability:** MCP stdio remains protocol-only on stdout. The helper binds its browser endpoint to `127.0.0.1` on an OS-assigned port. Connection information is available through an MCP response rather than relying on printed logs. Discovery and invocation identify the paired session.
- **R5 — Authenticated pairing:** The helper accepts only configured exact web origins and authenticated connections. Pairing credentials are short-lived, not logged or durably stored by the bridge, and not sent in HTTP/WebSocket query strings. Authentication precedes registration or execution.
- **R6 — Session isolation:** A helper serves at most one active page session and a tab has at most one active helper connection in this version. Other connections cannot silently replace the owner. Disconnect, reload, origin changes, and stale responses cannot transfer authority to a different session.
- **R7 — Tool and result contracts:** Tools have names, descriptions, JSON input schemas, and asynchronous handlers. Invocation is checked against the current session/catalog and schema. Plain JSON results, declared text/image envelopes, and structured failures cross the bridge without application-specific interpretation.
- **R8 — Bounded failures and cancellation:** Requests, unauthenticated connections, payloads, images, and pending work have finite enforced limits. Timeouts, cancellation, disconnects, and handler failures are distinguishable. Mutations are not automatically replayed, and an uncertain outcome is not represented as a guaranteed rollback.
- **R9 — Model-visible images:** A valid image result becomes an MCP image content block, not only a base64 string in text. Normal JSON tools do not have to return an image envelope.
- **R10 — Authoring reads and context:** The REPL exposes source, editable uniform definitions, draft/applied identity, application constraints, and diagnostics sufficiently for an external agent to author without guessing the shader model. Reads do not mutate drafts or runtime controls.
- **R11 — Authoring writes:** The REPL permits creation/removal/modification of supported uniform definitions alongside main/utils edits. Valid updates affect the visible editor and draft state consistently; definition caches are derived rather than trusted from callers.
- **R12 — Concurrency and undo:** Every relevant manual or agent authoring change participates in draft revision tracking. Updates require an expected revision, apply atomically to requested authoring fields, preserve unrelated fields, reject stale requests without changes, and leave source edits undoable.
- **R13 — Apply and diagnostics:** Apply targets a specific draft revision and reports compilation, installation, and draw outcomes separately. Visual readiness requires successful installation and drawing of that revision. Failures preserve the last successfully installed preview and return structured diagnostics where available; stale/superseded work is never reported as current success.
- **R14 — Correlated capture:** Capture returns the actual preview canvas with applied revision, dimensions, backend, and read-only uniform values. It cannot silently substitute a different canvas/revision or return a previous frame as the requested result.
- **R15 — Authoring boundary:** No registered REPL tool directly changes runtime controls, saves/deletes/publishes a sketch, or expands into unrelated app/browser actions. Existing Apply effects, including resetting runtime values to definition defaults, remain permitted and documented.
- **R16 — Visible lifecycle and recovery:** The page makes pairing, connection status, failures, and disconnect understandable. Permission denial or an unavailable helper is recoverable without breaking normal sketching. Disconnect ends bridge authority without erasing the sketch or undoing completed edits.

## Behavior and contracts

### Connection and pairing flow

1. The agent launches the helper through ordinary MCP configuration. The helper starts with an explicit allowed origin supplied by configuration/flag/environment, not a hard-coded REPL host or an origin accepted from an unauthenticated page.
2. The helper binds an available loopback port and prepares a short-lived, high-entropy pairing credential. Browser endpoints are not exposed on non-loopback interfaces.
3. The agent calls `get_connection_info`. Its response includes connection status and, when pairing is available, the local endpoint information and a connect URL for an explicitly configured/validated site URL. Sensitive connection information is returned intentionally in that response, not as startup logging.
4. The user opens the URL, or enters the equivalent connection information in the existing tab. A fragment may carry the port and token. The browser library reads and removes credentials from the fragment/history entry before normal bridge use and avoids forwarding them to telemetry.
5. The page connects only to the supported literal loopback address/port. It does not accept arbitrary WebSocket hosts from URL input. The first protocol message authenticates; no tools are registered or called before authentication.
6. The helper checks the exact browser `Origin`, token validity, and connection ownership. Successful pairing creates a new opaque session ID and registers the tool catalog.
7. The user makes normal requests to the agent. The helper serves discovery and dispatches calls to the paired page.
8. The user can disconnect. A later independent pairing receives a new session identity.

`get_connection_info` is an additional connection operation beside `list_tools`, `describe_tool`, and `call_tool`; final MCP names may be namespaced to avoid collisions. The fixed surface does not grow a shader-specific command set. Site tools remain discoverable data behind it.

### Observable connection states

| State                           | Available behavior                                                    | Failure/recovery                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Unpaired                        | Normal site use; connection info and instructions; no site invocation | Starting a helper or entering a valid link enables pairing.                                                                  |
| Connecting/authenticating       | Status is visible; no site-tool authority                             | Permission denial, wrong origin/token, timeout, or unavailable helper produces a useful error without changing sketch state. |
| Connected                       | Discovery and calls for the named session                             | A second connection is rejected or requires explicit disconnection of the current owner.                                     |
| Transport interrupted           | Pending requests receive a bounded failure/uncertain outcome          | The same live page may resume only with a valid session credential and no competing owner.                                   |
| Disconnected/reloaded/navigated | Old requests/session credentials cannot establish new authority       | New pairing is required after reload/navigation or explicit disconnect.                                                      |

The session-lifecycle default assumed by this specification is single-use initial pairing tokens, with an in-memory resume credential for transient transport reconnects and no persistence across reload. This is a conservative assumption, not a separately approved UX choice. Authentication expiration and disconnect revoke pending pairing/resume authority. No automatic reconnection to a different origin, page instance, or owner is permitted.

### Discovery and invocation

The browser library provides the semantic equivalent of:

```ts
connectAgentBridge({ tools });
// Each tool: { name, description, inputSchema, async handler(input) }
```

Exact library packaging and type names are planning choices. The behavioral contract is:

- Names are unique within a session; duplicate/invalid registrations fail explicitly.
- `list_tools` returns the session identity and concise available tool descriptions; `describe_tool` returns the current input schema and relevant behavioral documentation.
- `call_tool` identifies session, tool, and JSON arguments. The helper validates against the authenticated catalog; the page validates at the handler boundary as well.
- Calls carry request and session identities. Unknown/stale sessions, missing tools, invalid arguments, and stale catalog entries are rejected rather than routed elsewhere.
- A disconnected response directs the agent to connection information, not to a fabricated empty application state.
- A page/library teardown removes handlers and connections. Tool removal/catalog replacement invalidates affected discovery data.
- There is no implicit script-evaluation fallback for missing tools.

### Results and images

Ordinary JSON-serializable results are returned as readable JSON/text. The bridge also recognizes an explicit versioned envelope with text/image content and optional JSON metadata. The proposed encoding default is text and base64-encoded PNG/JPEG image entries with explicit MIME type, using PNG for REPL capture; this is a planning assumption, not a separately agreed format restriction. Exact envelope field spelling and supported encodings belong in the shared protocol contract during planning, not in site-specific code.

The helper converts image entries into actual MCP image content and preserves accompanying readable metadata. Metadata must not suppress image delivery in supported clients. It does not fetch arbitrary image URLs or treat every object with a `data` field as an image. Unsupported envelope versions, MIME types, malformed base64, or oversized content fail clearly.

Tool descriptions/results are untrusted content, not privileged instructions. The bridge does not attempt to replace the agent's normal treatment of external input.

### Errors, timeouts, and cancellation

Failures expose a stable machine-readable category and human-readable message, with relevant structured details. Categories distinguish at least: not connected, authentication/origin failure, session conflict/staleness, unknown tool, invalid arguments, revision conflict, handler error, timeout/cancellation, superseded apply, render/capture failure, and payload limit.

The helper advertises or documents its effective finite authentication, request, payload, image, and pending-request limits. Numeric defaults are planning decisions and must be chosen and boundary-tested before implementation is accepted. Authentication frames and unauthenticated connections receive their own bounds, before tool schemas or images can be submitted.

Disconnect/cancellation stops accepting or dispatching new work for that session and signals in-flight work where supported. A timeout or dropped response does not imply that an already-dispatched mutation was rolled back. The agent is directed to reread revisions/state when the outcome is unknown. Reconnect never automatically replays a mutation. Late results cannot complete a different request or session.

### REPL tool semantics

| Site tool               | Contract                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_authoring_context` | Describe main/utils composition, supported shader subset/built-ins, uniform-definition schema/validation, explicit Apply, revision usage, and relevant preview limitations. Read-only.                                                                |
| `get_sketch`            | Return both source documents, editable uniform draft data, current draft revision, last successfully applied revision if any, and enough status to distinguish unapplied/failed work from installed output. Read-only.                                |
| `update_sketch`         | Accept an expected draft revision and a nonempty set of main, utils, and/or uniform-definition replacements. Omitted fields remain unchanged. Return the resulting revision or a conflict/validation failure. No implicit Apply.                      |
| `apply_sketch`          | Require the expected current draft revision, snapshot that revision, and return its compile/install/draw outcome with diagnostics and relevant revision identities. It does not claim readiness before a frame has drawn.                             |
| `get_diagnostics`       | Return current/recent compile and runtime diagnostics with their originating revision/attempt where known, without implying that a failed draft is installed. Preserve document/range and backend/kind information when available.                    |
| `capture_preview`       | Capture the currently installed canvas at a draw/export boundary. Accept an expected applied revision for guarded capture; return image content plus capture metadata or an explicit mismatch/unavailable/failure result. No runtime-control setters. |

#### Draft and uniform definitions

The proposed semantic update shape is `{ expectedRevision, main?, utils?, uniforms? }`. The simplifying defaults assumed here are complete main/utils source strings and complete replacement of a supplied uniform list, allowing add/delete/modify in one authoring operation without a patch language. These are schema defaults, not separately interviewed product decisions; planning may refine the representation while preserving atomicity, omission semantics, and revision checking.

Published schemas must describe the app's actual supported float/color authoring model, including identity, name, type, definition default, and supported range metadata. The assumed identity policy preserves existing valid IDs and assigns noncolliding IDs to new definitions. Internal color caches are derived consistently. Exact wire field names and normalization of UI string fields are non-blocking schema design choices, but the API must not misrepresent incomplete manual drafts as valid compiled definitions or discard their editable information on read.

Updating source does not require it to compile: editing and applying remain separate. Definition updates use existing semantic validation and do not invent additional types or reserved names. An invalid multi-field update changes none of the requested fields. Conflict checking happens before mutation. All requested valid fields become one coherent draft state; no subscriber/tool read observes a partially committed authoring command.

Programmatic source changes use CodeMirror's document/history machinery, update the visible editors and store consistently, and remain undoable. Undo/redo and manual definition edits also advance draft identity. A successful command returns the revision of the completed coherent update rather than intermediate editor notifications.

#### Applying and preserving preview identity

Track draft identity separately from the last successfully installed/drawn revision. A compilation attempt is not evidence that the preview changed. Existing preview state is preserved on failure, and successful Apply continues the app's existing runtime-reset behavior.

A newer Apply or renderer lifecycle replacement may supersede an earlier attempt. Old completion callbacks cannot overwrite the newer status/applied identity. Manual edits during Apply may produce a newer draft while the captured older draft completes; the response must identify exactly what installed and whether the current draft differs. Applying an already stale expected revision is rejected without installing it.

#### Capture correctness

Capture exports the active application canvas, not the page viewport. The image and metadata must correspond to the same installed revision. If that identity changes during capture, return a mismatch/superseded result instead of mislabeling the image. Metadata includes actual pixel width/height, backend, and a read-only snapshot of current runtime uniform values. It may include animation time if reliably observed, but it does not promise deterministic timing.

WebGL and WebGPU need real-browser validation. Export failures, tainted canvases, unavailable previews, and encoding/size limits are explicit errors; an empty or unrelated image is not a successful fallback. Capture does not expose a playback/seek/pause API or permanently alter current controls.

### Unchanged behavior

Pairing, discovery, reads, and disconnect do not edit the sketch. Agent writes alter only their requested authoring fields; existing manual runtime controls remain usable. Only Apply has its existing permitted effects on renderer state and uniform defaults. No tool introduces persistence/publication actions or silently changes backend fallback policy.

## Ownership and boundaries

| Owner                    | Owns                                                                                                                                      | Must not own/depend on                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| External agent           | User-request interpretation, planning, tool selection, normal permissions and reporting                                                   | A new task/approval engine inside the REPL.                                                                          |
| Local helper             | MCP stdio, loopback endpoint, pairing/session checks, generic schemas/routing, limits, result conversion                                  | Shader compiler logic, CodeMirror, REPL-specific names/selectors, arbitrary filesystem/browser control, stdout logs. |
| Browser client library   | Generic registration/dispatch, page-local connection lifecycle, result helpers, teardown                                                  | Shader state, renderer internals, WebMCP or extension APIs as required dependencies.                                 |
| REPL provider/controller | Authoring schemas/context, draft/editor synchronization, revisions, definition validation, compile/render status and snapshot integration | Agent orchestration, arbitrary script execution, transport-specific application logic.                               |
| Hosting deployment       | Serve the normal app and an appropriate CSP                                                                                               | Agent conversations, a relay backend, local helper credentials in server logs, or an MCP endpoint.                   |

A site integrating the library is trusted to implement its advertised actions. Origin checks primarily constrain ordinary browser pages; native local programs can spoof an Origin header. Tokens are still required, but this design is not a defense against a compromised OS or malicious code executing inside the trusted site. Pairing fragments are not sent in HTTP requests, yet scripts executing on that page can read them.

## Acceptance criteria

These are proposed verification expectations, not completed checks.

| ID   | Requirement(s)                  | Starting condition / action                                                                                                                              | Expected outcome                                                                                                                                                                             | Verification approach                                                  |
| ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| AC1  | R1, R3, R16                     | Open the real HTTPS-hosted REPL without a helper, then start the agent/helper and pair through the UI/link.                                              | Sketching works before pairing; pairing succeeds without a local REPL server, extension, or debugging access and triggers no authoring operation.                                            | Live Chrome/Pi walkthrough.                                            |
| AC2  | R1, R4, R16                     | Agent launches a fresh helper; request connection information and deny/reset browser local-network permission.                                           | MCP remains valid, connection info is available in a tool response, denial is understandable/recoverable, and the normal site is unchanged. Granting permission enables retry.               | Live HTTPS/CSP/browser check plus transport tests.                     |
| AC3  | R2, R7, R9                      | Connect an unrelated demo page exposing a read, mutation, and image using the same packages.                                                             | All three work without shader-specific bridge changes; the image reaches the model as image content.                                                                                         | Integration/demo check and source-boundary review.                     |
| AC4  | R2, R4, R9                      | Configure Pi, then Claude Code and Codex with the same helper implementation; discover/call a tool and request an image.                                 | Each uses standard MCP without a client-specific adapter; the configured image-capable model can inspect the image.                                                                          | Client compatibility checks; Pi is the first required end-to-end gate. |
| AC5  | R4, R5                          | Start two helper processes with the same configured allowed origin. Inspect bindings and startup output.                                                 | Distinct OS-assigned loopback ports avoid collision; neither listens externally, leaks secrets to logs, nor emits non-MCP stdout.                                                            | Automated transport checks.                                            |
| AC6  | R5, R7                          | Attempt pairing with absent/null/wrong origin, wrong/expired token, or a tool registration before authentication.                                        | Connection/registration is rejected with no site-tool authority or sketch change; an allowed origin alone is insufficient.                                                                   | Protocol/security tests.                                               |
| AC7  | R5, R16                         | Pair using a fragment URL, then inspect location/history behavior and ordinary logs/telemetry.                                                           | Credentials are removed from the active fragment/history entry, absent from normal logs, and not durably stored by the bridge.                                                               | Browser inspection and logging tests.                                  |
| AC8  | R6, R16                         | With a paired tab, attempt a second page/helper connection, then explicitly disconnect and pair anew.                                                    | Ownership is not silently replaced; switching requires releasing the current connection; new pairing has a different session identity and preserves the sketch.                              | Session integration tests.                                             |
| AC9  | R6, R8                          | Dispatch a request, then reload/navigate/disconnect and deliver the old response or credential.                                                          | No result or authority transfers to the new page/session; pending work settles as disconnected/uncertain rather than succeeding elsewhere.                                                   | Lifecycle/stale-message tests.                                         |
| AC10 | R7                              | Call an unknown tool, removed tool, wrong session, or invalid schema input.                                                                              | Explicit rejection occurs before the handler mutates state; valid calls use the current advertised schema.                                                                                   | Protocol and handler-boundary tests.                                   |
| AC11 | R8                              | Exceed configured auth time, unauthenticated/pending limits, frame/image limits, or request timeout; cancel an in-flight mutation.                       | Limits are enforced with bounded cleanup; no automatic mutation replay or false rollback claim; late results cannot satisfy another request.                                                 | Boundary/failure-injection tests.                                      |
| AC12 | R7, R9                          | Return ordinary JSON, a valid image envelope, and malformed/unsupported envelopes.                                                                       | JSON remains readable; images become actual MCP image blocks with metadata; invalid versions/MIME/encoding fail clearly without arbitrary URL fetching.                                      | Result conversion tests and model-visible image check.                 |
| AC13 | R10, R15                        | Read context, sketch, and diagnostics while a draft differs from the applied preview.                                                                    | The agent learns source composition, supported definition schema and revisions; reads preserve draft, preview, and runtime controls.                                                         | REPL controller tests and live inspection.                             |
| AC14 | R11, R12                        | Submit a revision-matching update changing main/utils and adding/deleting/modifying supported definitions.                                               | Requested authoring fields commit coherently, visible editors/store agree, unchanged fields are preserved, and returned revision matches the final draft.                                    | Store/editor/controller integration tests.                             |
| AC15 | R11, R12                        | Submit one multi-field update with invalid definition data; repeat with valid data but a stale revision after a manual edit.                             | Both failures leave every authoring field unchanged and explain validation/conflict respectively.                                                                                            | Negative controller tests.                                             |
| AC16 | R12                             | Make an agent source edit, undo/redo it in the editor, then make a manual source/definition edit.                                                        | Source undo restores the previous document with consistent store state; all actual authoring changes advance draft identity, invalidating earlier expected revisions.                        | CodeMirror/browser integration tests.                                  |
| AC17 | R13                             | Apply a current draft while delaying shader installation and drawing.                                                                                    | Response is not visually ready before install and draw finish; successful output identifies the installed revision and current draft relationship.                                           | Controlled lifecycle tests and real renderer check.                    |
| AC18 | R13, R15                        | Apply invalid source, force a runtime replacement failure, or issue Apply with a stale expected draft revision.                                          | Structured, revision-aware errors distinguish the causes; the previous installed preview/identity is retained and stale Apply does not install.                                              | Compile/runtime failure tests.                                         |
| AC19 | R13, R14                        | Supersede an Apply or replace the renderer during an in-flight Apply/capture.                                                                            | Stale completion cannot replace newer status; capture either identifies the correct surviving revision or reports mismatch/supersession.                                                     | Async race tests.                                                      |
| AC20 | R9, R14                         | Apply a known sketch and capture its installed WebGL/WebGPU canvas using the actual supported deployment/browser.                                        | A model-visible image in the selected supported encoding has correct pixel dimensions, backend, applied revision, and read-only uniform metadata; no viewport image is silently substituted. | Live backend export checks and metadata assertions.                    |
| AC21 | R8, R14                         | Capture before a preview exists, with a different expected applied revision, on export failure, or above the image limit.                                | Explicit categorized failure; no empty, stale, or mislabeled success.                                                                                                                        | Snapshot negative tests.                                               |
| AC22 | R3, R15, R16                    | Inspect the available REPL tool catalog; pair/read/disconnect while manual runtime values/playback are set. Then successfully Apply changed definitions. | No runtime setters, save/delete/publish, or arbitrary evaluation are available; connection/read/disconnect preserve controls; Apply retains documented existing reset-to-default effects.    | Schema review and live unchanged-behavior check.                       |
| AC23 | R1, R9, R10, R11, R12, R13, R14 | From Pi against the deployed REPL, request a visual change requiring source and definition edits, then ask for review.                                   | Pi reads, authors, applies, receives diagnostics and a real image, and reports the result; no per-action REPL approval UI or local app server is needed.                                     | End-to-end user journey after the connection/image gate.               |

## Assumptions

- Initial browser support targets a desktop Chrome configuration to be selected and validated. Cross-browser support is deferred, and accepting experimental Chrome features earlier does not imply this design depends on WebMCP flags.
- Public HTTPS to `ws://127.0.0.1` is feasible under the target Chrome mixed-content/local-network rules. This is an unvalidated deployment assumption; actual Local Network Access permission behavior, enterprise restrictions, and CSP must be tested on the deployed origin before full integration proceeds.
- The deployment can allow the loopback endpoint through `connect-src`. Dynamic ports may require an explicit `ws://127.0.0.1:*` allowance, which is wider than a single selected port. Confirm the site's current/effective policy and whether this allowance is acceptable in that environment.
- Installed Pi documentation indicates stdio MCP and image-block support; actual delivery through the chosen model/client path is not verified. Image-capable models are required for visual review. Other clients need compatibility checks, not separate bridges.
- One active page per helper and one helper per tab are simplifications of the agreed single-agent-per-tab boundary. They avoid multi-site/session selection in the first version; future session routing must not require shader-specific behavior.
- Short-lived pairing followed by memory-only resume, re-pairing after reload, full-field updates, and existing-ID preservation are conservative contract defaults consistent with the discussion, not separately interviewed UX decisions. Validate usability without introducing persistent secrets or task approval.
- Optional React wrappers and package/repository placement are not product requirements. Their omission must not prevent the deployed workflow or reuse from another site.

## Risks and open decisions

- **Blocking product decisions:** None identified.
- **Technical validation gates:** Prove real hosted HTTPS connectivity, local-network permission recovery, safe pairing UX, and a model-visible image through Pi before committing to the full integration. Failure requires revisiting transport/browser support rather than claiming the direct design works. WebGL/WebGPU canvas capture is a separate real-browser gate before claiming preview support for those backends.
- **Non-blocking protocol details:** Planning must finalize protocol/envelope field names, tool schema normalization, effective finite limits, expiration durations, namespace/versioning, and helper configuration/distribution. These details may not weaken the behavioral requirements or create new application capabilities.
- **Origin and token limitations:** Browser Origin checks are not authentication of native programs; the trusted page's scripts can read pairing data. Reduce token exposure, avoid third-party instrumentation of credentials, and do not claim OS compromise resistance.
- **Uncertain mutation outcomes:** Network failure cannot guarantee rollback of an already-executing tool. Revision-aware rereads, session isolation, and no automatic replay are required recovery mechanisms.
- **Renderer races and animation:** Draft/compile/install/draw are distinct states. Animated captures are observations, not deterministic proofs; fail explicitly on identity races and retain backend metadata.
- **Multi-client variability:** Images, combined metadata, tool errors, and cancellation may be handled differently by clients/models. The compatibility checks must verify observable behavior rather than assuming standard schemas guarantee identical UX.
- **Authoring schema design:** Manual drafts can be temporarily invalid. The published read/write schemas must preserve editable information while rejecting invalid submitted definition updates; UI cache fields must not become independently trusted authoring inputs.

## Deferred work

- WebMCP registration adapters, browser extension transport, Chrome debugging transport, or a hosted relay; revisit only for a demonstrated limitation or a separate learning goal. Keep handler definitions transport-neutral without promising drop-in compatibility with evolving WebMCP APIs.
- Simultaneous agents, multi-page helper sessions, shared daemons, cross-machine control, persistent trust, and multi-user collaboration.
- Safari/Firefox certification, deterministic animation/time control, and raw GPU image export.
- Runtime-control tools, persistence/publication tools, broader shader/uniform-language capabilities, and arbitrary third-party site adapters.
- Elaborate plugin frameworks, agent/task/approval UX, and implementation plans. This document defines behavior; execution sequencing belongs in a later plan.
