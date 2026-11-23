# Stateless MCP Specification

## Status

- Readiness: Ready for planning
- Blocking decisions: None under the compatibility-preserving assumptions below.
- Overview: [overview.md](overview.md)
- Implementation plan: [plan.md](plan.md)
- Source: Conversation requesting an MCP SDK v2 migration and adoption of MCP 2026-07-28; supplied SDK maintenance notice and Pi MCP documentation; source inspection and official references below.
- Decision provenance: The requested direction is SDK v2 plus newer-spec support. Retaining legacy compatibility and excluding changes to Pi were recommended, but not separately confirmed by the user; this specification carries them as explicit working assumptions, not recorded approvals.

## Problem and intended outcome

`app-mcp` currently depends on the maintenance-only MCP TypeScript SDK v1 and serves the older initialization-based protocol. Upgrade the server to SDK v2 and support the 2026-07-28 Model Context Protocol specification without breaking existing clients or changing the browser application's tool behavior.

The observable outcome is one CLI that accepts both modern stateless MCP requests and legacy client connections. Existing Pi users continue pairing and using the REPL unchanged. A modern client can deliberately select 2026-07-28 and exercise the same tools. These are separate compatibility claims: upgrading the server does not upgrade Pi or make Pi use the new protocol.

## Scope

Included:

- SDK v2 dependency/API migration within `packages/agent-bridge`, including its SDK-based test clients and package declarations.
- Dual-era stdio serving: MCP 2026-07-28 plus legacy initialization-based clients.
- Preservation of browser pairing, explicit session/catalog handles, tool results, cancellation, recovery, public package entry points, and CLI configuration.
- Verification of modern and legacy behavior and a real installed-Pi smoke check.

Non-goals:

- Modifying, replacing, or upgrading Pi's MCP client.
- Serving MCP over HTTP, adding OAuth, or introducing an MCP HTTP session store. The helper's existing loopback HTTP/WebSocket service is not an MCP HTTP endpoint.
- One helper process per request, removal of browser application state, or multiple MCP principals sharing one helper process.
- New tools, promotion of browser tools into top-level MCP tools, changed browser wire protocol, new catalog notifications, or changed REPL authoring semantics.
- Adoption of unrelated 2026 features such as elicitation/sampling workflows.
- Publishing or deploying a package as part of specification authoring.

## Current behavior and evidence

All local findings below are from static inspection, not new runtime verification.

- [`packages/agent-bridge/package.json`](../../packages/agent-bridge/package.json) names the package and CLI `app-mcp`, requires Node >=24, and depends on `@modelcontextprotocol/sdk` 1.32.2. Public entry points include `.`, `/protocol`, `/browser`, `/server`, `/zod`, `/react`, and `/zustand`.
- [`src/bin.ts`](../../packages/agent-bridge/src/bin.ts) starts the loopback bridge and attaches `StdioServerTransport`. [`src/server.ts`](../../packages/agent-bridge/src/server.ts) constructs one `McpServer`, registers four fixed tools, and closes the whole bridge from the MCP server's `onclose` callback. It captures legacy client display metadata on initialization. These lifecycle and metadata assumptions need adaptation.
- The public `BridgeServer` interface exposes `port`, `connectionInfo()`, `attachMcp(transport): Promise<void>`, and `close(): Promise<void>`. Attachment is single-use, and the bridge owns the attached transport.
- [`src/protocol.ts`](../../packages/agent-bridge/src/protocol.ts), [`src/session.ts`](../../packages/agent-bridge/src/session.ts), and [`src/browser.ts`](../../packages/agent-bridge/src/browser.ts) define a separate, stateful browser protocol with authenticated pairing, explicit session/catalog identities, cancellation, and bounded refresh recovery. Browser application state is not MCP protocol-session state.
- [`test/transport.test.ts`](../../packages/agent-bridge/test/transport.test.ts), [`test/catalog.test.ts`](../../packages/agent-bridge/test/catalog.test.ts), and [`test/requests.test.ts`](../../packages/agent-bridge/test/requests.test.ts) exercise stdio, catalogs, images, cancellation, disconnects, and recovery. [`test/verify-packed.mjs`](../../packages/agent-bridge/test/verify-packed.mjs) inspects the installed package surface. These existing tests are useful evidence sources, not proof of future v2 behavior.
- [`.pi/mcp.json`](../../.pi/mcp.json) launches the built CLI over stdio with `--allowed-origin` and `--site-url`.
- Installed Pi is `@earendil-works/pi-coding-agent` 1.4.0 with its standalone `@earendil-works/pi-mcp` 1.4.0 client, not the official SDK. Under `/Users/andy/.local/share/fnm/node-versions/v24.21.0/installation/lib/node_modules/@earendil-works/pi-coding-agent/`, `node_modules/@earendil-works/pi-mcp/dist/protocol/types.js` lists 2025-11-25 as latest and supports only that version plus 2025-06-18, 2025-03-26, and 2024-11-05. `node_modules/@earendil-works/pi-mcp/dist/client.js` initializes and rejects unsupported selected versions; `dist/extensions/mcp/runtime.js` does not override its version default. This establishes that the inspected Pi cannot negotiate 2026-07-28, not that a live connection has been tested.

Official reference behavior:

- [SDK v2 migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2): split server/client packages; upgrading dependencies alone does not enable the new protocol.
- [2026 migration](https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.4.0/docs/migration/support-2026-07-28.md) and [stdio serving](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio): `serveStdio(factory)` supports both eras, defaulting to legacy support. Direct `McpServer.connect(StdioServerTransport)` remains the older mode. Modern test clients must explicitly select modern negotiation.
- [`serveStdio` v2.4.0 source](https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.4.0/packages/server/src/server/serveStdio.ts): discovery can create a probe instance that is discarded before legacy fallback. Factory-instance lifetime is not shared-helper lifetime.
- [2026 basic protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic), [stdio binding](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio), and [tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools): modern requests carry protocol/capability metadata; application state may remain behind explicit handles. Stdio cancellation still uses `notifications/cancelled`.

The deliberate difference is MCP protocol negotiation and request handling. Existing browser-visible behavior remains the reference contract; the older [agent MCP specification](../_completed/agent-mcp/spec.md) provides historical context, but current source is authoritative where naming has evolved.

## Requirements and invariants

- **R1 — SDK line:** `app-mcp` uses the stable SDK v2 server packages rather than the v1 monolith. Its SDK-based test clients use compatible v2 packages. Migration does not increase the existing Node >=24 requirement.
- **R2 — Dual-era default:** The same CLI invocation supports MCP 2026-07-28 and existing legacy clients, including the installed Pi's 2025-11-25 flow. Modern support must be demonstrated by explicit modern negotiation, not inferred from a package version. Ordinary users need no protocol-selection flag or project configuration change.
- **R3 — Explicit application state:** Modern request behavior does not depend on a previous MCP initialization or implicit MCP conversation state. Browser session and catalog authority remain explicit tool inputs; a previous successful request cannot make omitted or stale handles valid.
- **R4 — Tool parity:** Both eras expose the same four fixed MCP tools, argument schemas, bridge errors, text/image results, and effective safety limits. Browser catalog changes remain explicit rediscovery through the bridge tools; browser tools do not become top-level MCP tools.
- **R5 — Security parity:** Exact-origin loopback pairing, credential validation, one-page ownership, browser-session isolation, and schema/size validation remain enforced in both eras. MCP client display metadata, protocol metadata, and possession of a session ID do not establish browser authentication.
- **R6 — Request safety:** Cancellation, timeouts, disconnects, catalog invalidation, and refresh recovery retain bounded cleanup and no-replay behavior. A browser mutation is never reported as rolled back merely because its MCP request was cancelled or its result was lost.
- **R7 — Lifecycle separation:** MCP discovery/probe creation, fallback, and disposal must not create duplicate loopback helpers, consume pairing credentials, invalidate the paired page, cancel unrelated page work, or close shared helper resources. Actual CLI transport termination and explicit bridge close still release all owned resources.
- **R8 — Metadata isolation:** Legacy initialization metadata may retain its current display-only use. Modern requests must not rely on initialization metadata or reuse another request's client identity/capabilities as authority. Missing or changing self-reported client display information must not block valid tool operations or change browser ownership.
- **R9 — Package/API continuity:** Existing CLI arguments and public package entry points remain usable. `startBridgeServer`, `connectionInfo`, `attachMcp(transport)`, and `close` retain their existing callable behavior, including single-use attachment and transport ownership, with SDK v2 types at the MCP boundary. No compatibility guarantee is made for v1 SDK transport types.
- **R10 — Honest client compatibility:** Installed Pi remains functional through legacy support, without modifying Pi. Documentation distinguishes server support for 2026-07-28 from the protocol actually used by Pi and records the client/version exercised during live acceptance.

## Behavior and contracts

### Connection and protocol selection

One CLI process owns one loopback browser bridge. Its stdio entry accepts either a legacy initialization flow or the modern discovery/request flow using the SDK's supported dual-era serving boundary. SDK `serveStdio(factory)` is the reference integration; a dependency-only migration is insufficient.

Legacy Pi continues using its supported version. Modern acceptance uses a client pinned to 2026-07-28 so fallback cannot mask missing modern support. Automatic modern discovery followed by legacy fallback is also supported and must not tear down the helper.

Missing required modern metadata, malformed requests, and unsupported versions follow the selected SDK/spec's protocol-error behavior, rather than silently executing a browser tool in another era. Rejected calls must not dispatch browser operations or mutate pairing/session/catalog state. This requirement does not impose a custom process-exit policy beyond the SDK transport lifecycle.

The helper remains long-lived. Statelessness removes reliance on MCP protocol-session context; it does not remove the independently authenticated page, its catalog, or pending browser operations.

### Fixed tool surface

| Tool | Input | Preserved behavior |
| --- | --- | --- |
| `bridge_get_connection_info` | `{}` | Return current `unpaired`, `connected`, or `interrupted` information and effective limits; pairing URL only when appropriate. |
| `bridge_list_tools` | `{ sessionId }` | Require the current browser session and return its `catalogVersion` and declared tools. |
| `bridge_describe_tool` | `{ sessionId, name }` | Require the current browser session and return the declared tool schema/description or the existing error. |
| `call_tool` | `{ sessionId, catalogVersion, name, arguments? }` | Require current session/catalog and a declared tool; omitted `arguments` means `{}`. Validate before dispatch. |

Preserve existing error categories, including `not_connected`, `stale_session`, `stale_catalog`, `unknown_tool`, and `invalid_arguments`. A tool-level failure remains an MCP error result, distinct from a malformed MCP protocol request.

Browser result envelopes remain `{ bridgeResultVersion: 1, content: [...], metadata? }` and retain their current mapping to MCP text and PNG/JPEG image content. REPL authoring operations retain optimistic revision validation and explicit apply/capture semantics; the SDK migration adds no implicit mutation, apply, retry, or capture.

### Browser security and recovery

The browser wire protocol and `BRIDGE_PROTOCOL_VERSION` remain unchanged. Preserve the current five-minute single-use pairing credential, five-second authentication deadline, exact allowed-origin check, one active page, 30-second resume lease, and fresh session/catalog identity on successful resume. Session identifiers are handles, not substitutes for the pairing/resume authentication flow.

Preserve the 30-second browser request deadline, eight pending-call limit, 8 MiB authenticated frame limit, 4 MiB decoded-image limit, 64-tool catalog limit, and 512 KiB catalog limit. This migration does not retune limits.

| Event | Required observable outcome |
| --- | --- |
| Explicit MCP cancellation of an active browser call | Abort/cancel page work where possible; stop delivering results for the cancelled modern request according to the stdio spec. Preserve uncertain-outcome semantics where a result is returned under legacy behavior. |
| Browser request deadline expires | Cancel outstanding page work, release its pending slot, and preserve the existing timeout/uncertain-outcome result semantics. |
| Catalog replaced while work is pending | Invalidate old catalog work; subsequent stale-version calls fail before browser dispatch. |
| Browser disconnect or refresh | Cancel affected pending calls; ignore late results. Eligible refresh can resume within the existing lease, with fresh handles and no replay. |
| MCP probe discarded or fallback occurs | Keep the existing helper, pairing state, catalog, and browser connection alive. |
| Stdin EOF, attached transport closes, or explicit bridge close | Cancel pending work, close owned sockets/listeners and transport, and prevent further use of that bridge instance. |

Cancellation does not guarantee rollback. A possibly completed browser mutation must not be automatically retried after cancellation, refresh, reconnect, or missing response.

### Lifecycle and client display metadata

Shared loopback resources belong to the bridge process, not to a factory-created MCP probe/server instance. Factory creation and disposal must be safe before or after browser pairing. Closing a disposable MCP instance is different from terminating the actual stdio connection.

Modern client metadata is optional and self-reported. It may be absent from browser display; retaining the old handshake-derived label is not required in modern mode. Any displayed label remains advisory and must not become authentication or influence session selection. Per-request capabilities must be interpreted for that request, not inherited from another request's metadata.

## Ownership and boundaries

- `packages/agent-bridge` owns the SDK dependency, MCP serving adapter, fixed bridge tools, loopback helper, and public server declarations. SDK wire types stay at the MCP boundary; browser/React/Zustand integrations do not acquire a new SDK dependency.
- The MCP SDK owns protocol parsing, era negotiation, and stdio framing. Application handlers continue owning browser session/catalog validation and result conversion.
- The browser bridge owns authenticated page state and recovery. MCP protocol identity cannot override that authority or bypass origin/credential checks.
- Pi owns its client implementation and protocol support. This repository may verify and document it but does not modify it under this feature.
- Public `attachMcp(transport)` remains available for direct transport consumers. Supporting the CLI's dual-era factory may require an additional internal seam; the spec does not prescribe a new public API or require direct attachment itself to negotiate modern protocol.

## Acceptance criteria

These are proposed acceptance checks, not checks already performed.

| ID | Requirement(s) | Starting condition / action | Expected outcome | Verification approach |
| --- | --- | --- | --- | --- |
| AC1 | R1, R9 | Install the packed migrated package on supported Node and load its documented entry points and CLI. | Runtime and SDK-based test clients resolve compatible v2 packages, declarations reference resolvable v2 types, the Node floor remains >=24, existing entry points and flags remain available, and browser integrations do not require MCP SDK imports. | Manifest/declaration inspection, test-client typecheck, and packed-consumer checks on Node 24. |
| AC2 | R2, R4 | Start the CLI; connect a client pinned to 2026-07-28 without legacy initialization; pair a browser and exercise discovery/list/describe/call. | The selected revision is demonstrably 2026-07-28; the four fixed tools and their operations succeed without a legacy handshake. | Automated stdio integration with observable negotiated-version evidence. |
| AC3 | R2, R4, R9 | Connect a legacy 2025-11-25 client using the same CLI arguments; exercise a browser tool. | Legacy initialization and tool behavior succeed without a new configuration flag; schemas and results match the modern surface. | Automated legacy stdio integration. |
| AC4 | R3, R4, R8 | Perform successful modern calls, then send requests with omitted/stale session or catalog handles, different/absent advisory client information, and differing capability declarations permitted by the protocol. | Invalid handles still fail before dispatch; valid handles remain usable regardless of advisory client information; capabilities are evaluated per request, never inherited from a previous request or used as browser authentication; no implicit last-session shortcut exists. | Automated modern request tests with browser dispatch observation. |
| AC5 | R2, R3, R5 | Send malformed/unsupported modern protocol requests, including missing required metadata. | SDK/spec-defined protocol errors occur; no rejected request reaches a page handler or changes bridge authority. | Negative protocol integration tests. |
| AC6 | R4, R5 | In each era, try a wrong-origin/invalid-credential pairing, a second page, invalid tool arguments, unknown tools, and over-limit payloads. | Existing rejection and ownership rules remain effective; unauthorized or invalid calls do not execute. | Existing security/validation cases plus era-boundary coverage. |
| AC7 | R4, R6 | In each era, return text and an actual preview image; attempt an update with a stale expected revision. | Text/image content and metadata retain existing meaning; stale mutation is rejected and draft/applied revision state is unchanged. | Result integration and representative REPL behavior checks. |
| AC8 | R6 | In each era, cancel an active browser call, then allow a late result; separately exceed the request deadline. | Cancellation reaches the handler, pending capacity is released, late results are ignored, modern cancelled requests receive no subsequent result, and timeout/uncertain-outcome behavior is preserved. | Automated cancellation/deadline cases with dispatch and completion observation. |
| AC9 | R3, R4, R6 | Replace a catalog or refresh/disconnect the paired page with calls pending, then resume where eligible. | Pending work is invalidated, no mutation is replayed, old handles are rejected, and valid resumed calls require fresh session/catalog handles. | Automated catalog and recovery tests in both eras. |
| AC10 | R7 | In separate unpaired and paired cases, create/dispose a modern discovery probe and trigger legacy fallback. | Disposing the probe does not close the shared helper; only one loopback helper exists, no pairing credential is consumed by negotiation, page/session/catalog state is preserved, and the legacy connection remains usable. | Adapter lifecycle tests, controlling the negotiation boundary if needed. |
| AC11 | R6, R7, R9 | Close the actual stdio input/transport or explicitly close the bridge with work pending; repeat close and try reuse. | Owned resources are released, pending work is cancelled, repeated close is safe, and a closed/already-attached bridge cannot be attached again. | Automated subprocess and direct-transport lifecycle checks. |
| AC12 | R9 | Use `startBridgeServer` and `attachMcp` with a v2-compatible direct test transport. | Existing callable API and one-attachment/transport-ownership behavior remain intact independently of CLI negotiation. | Public API typecheck and direct-transport integration. |
| AC13 | R2, R10 | Connect the installed Pi using the existing project stdio entry; pair the REPL and discover/call a tool. | Pi works without modification. Evidence records the Pi version and legacy negotiated revision; it is not reported as a 2026 acceptance check. | Live Pi smoke check, separate from SDK-client automation. |
| AC14 | R10 | Review user-facing package guidance after migration. | Guidance distinguishes SDK version, supported protocol revisions, actual Pi behavior, and unchanged configuration. It does not claim HTTP MCP support or a Pi upgrade. | Documentation review. |

## Assumptions

- **Compatibility default, not separately approved:** Legacy clients remain supported by default. This avoids breaking the inspected Pi and adds no user-visible configuration. Modern-only operation would be a separate product change.
- **Scope default, not separately approved:** Pi changes are excluded; server-side modern support is proven using a modern test client, while Pi validates legacy compatibility. Enabling modern requests in Pi is not a prerequisite for this server feature.
- SDK v2.4.0 is the researched stable baseline. The exact compatible v2 patch set can be selected during planning, keeping related SDK packages aligned; changed upstream API/behavior must be rechecked against these acceptance criteria.
- One local CLI process remains a single trust boundary for its launching client. Multi-principal sharing is not introduced; explicit browser handles do not become network authentication credentials.
- Pi support is installation-specific. Static inspection establishes the current client's limitation; AC13 supplies the missing live evidence and must identify the client actually tested.

## Risks and open decisions

- **Blocking:** None for planning under the stated assumptions. If retaining legacy clients or excluding Pi changes is rejected, revise scope before implementation.
- **Lifecycle risk:** Existing MCP `onclose` closes the entire bridge. Reusing that callback for disposable v2 probe instances would break browser ownership and pairing; AC10 and AC11 distinguish these lifetimes.
- **Cancellation difference:** Modern cancellation suppresses subsequent request messages. Preserve browser abort/no-replay behavior without requiring the old cancellation error result to be emitted on a cancelled modern request.
- **API boundary risk:** Public `Transport` types move to v2. Existing app-level APIs remain stable, but consumers constructing v1 SDK transports must migrate their transport dependency; do not imply source compatibility across SDK majors.
- **Evidence limitation:** No application verification, live connection, dependency install, or implementation was performed to author this specification. Existing test source and static client inspection are not substitutes for acceptance evidence.

## Deferred work

- Pi 2026-07-28 client adoption, revisited when Pi exposes support or a separate client-upgrade effort is requested.
- HTTP MCP serving, OAuth, multi-client hosting, and dropping legacy compatibility, each requiring a separate scope/security decision.
- New MCP capabilities and notification models unrelated to preserving the existing four-tool bridge.
