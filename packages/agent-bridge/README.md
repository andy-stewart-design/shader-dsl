# @shdr/agent-bridge

A small, generic bridge between a standard MCP stdio client and explicitly declared tools in an HTTPS page (or explicitly configured localhost HTTP during development). It has no shader, browser automation, or agent orchestration behavior.

## Use

Have the MCP client start the foreground helper with an exact HTTPS origin and URL (plain HTTP is accepted only for explicitly configured `localhost`/`127.0.0.1` development origins):

```sh
shdr-agent-bridge --allowed-origin https://example.invalid --site-url https://example.invalid/
```

The helper binds only to `127.0.0.1` on an ephemeral port. Call `bridge_get_connection_info` over MCP to receive the short-lived pairing URL. The URL contains credentials only in its fragment; it is not logged or sent in the WebSocket URL. A page should call `consumePairingLink()` from `@shdr/agent-bridge/browser`, remove the fragment immediately, and pass the returned link to `connectAgentBridge`.

```ts
import {
  connectAgentBridge,
  consumePairingLink,
} from "@shdr/agent-bridge/browser";

const bridge = connectAgentBridge({
  tools: [
    {
      name: "read_state",
      description: "Read application state",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async () => ({ ready: true }),
    },
  ],
});
const link = consumePairingLink();
if (link) await bridge.connect(link);
```

The public protocol is version 1 and uses a versioned catalog and result envelope. JSON Schema is validated synchronously on both sides; remote `$ref` loading is rejected. `imageResult` accepts only base64 PNG/JPEG content and enforces the decoded 4 MiB image limit. Images become MCP image blocks, while ordinary JSON and metadata remain readable text.

Effective bounds are: 5 minute pairing lifetime, 5 second authentication deadline, 30 second request deadline, 4 KiB unauthenticated frames, 8 MiB authenticated frames, 4 MiB decoded images, 4 unauthenticated sockets, 8 pending calls, 64 tools, and 512 KiB catalogs.

## Pairing a hosted demo with Pi

From the repository root, register the built helper for the site's exact origin (replace the example with your deployment):

```sh
pi mcp add -l agent-bridge -- node "$PWD/packages/agent-bridge/dist/bin.mjs" --allowed-origin https://example.invalid --site-url https://example.invalid/
```

`-l` writes the current directory's `.pi/mcp.json`. Start Pi from that same directory: Pi does not search parent directories for this file. Use a user-level registration instead if you need the server in unrelated working directories. After changing the registration, run `/reload`; this restarts the helper and invalidates the previous connection.

Ask the agent for `bridge_get_connection_info`, open its pairing URL, and allow Chrome's request to access other apps/services on the device. With permission blocked, the page should show an attention/error state and the helper remains unpaired. Restore Allow, reload, and open a valid pairing link to recover. Pairing links expire after five minutes if unused; active connections have no five-minute expiry.

The page removes pairing credentials from the URL fragment before connecting. A same-origin reload or same-origin history traversal to the same page URL can resume through the scoped `sessionStorage` grant at `agent-bridge:resume:v1`; this grant is resume authorization, not an initial pairing token. New-document resume eligibility uses the browser navigation timing API. Resume rotates the credential and creates a fresh session and catalog (version 1). The lease starts when the connection drops and expires after 30 seconds; reconnect backs off from 250 ms to 2 seconds for at most 30 seconds. Storage-unavailable browsers fall back to fresh pairing. A different origin or page URL, helper restart, expired lease, or invalid grant requires a new pairing link. The bridge uses one controller per page, does not scan ports, never replays requests or mutations, and does not persist sketch/source/runtime state.

Explicit disconnect clears local resume state and revokes the remote lease when reachable; it remains safe when the network is unavailable. Pagehide closes the client without revoking the lease so a same-origin reload or history return can resume; consumers should not use explicit disconnect as page-unload cleanup. SDK cancellation and helper cancellation stop pending work, late responses are ignored, and the pending-call limit remains eight. To try this locally without deploying, rebuild the package/demo, restart the helper with the exact local origin, and reload the same page URL; a local build does not update an already-running helper or a deployed bundle. The live browser/manual conformance flow remains a later step. To check image delivery, discover the page's tools and invoke its image tool; receiving base64 in text alone is not success. Localhost results do not replace testing the real HTTPS origin and its browser permissions/CSP.

## Catalogs, validation, and results

Protocol version 1 is distinct from the catalog version. The first authenticated catalog is version 1. `await bridge.updateTools(nextTools)` validates the entire replacement before sending it, increments the catalog version, and replaces browser handlers only after the helper acknowledges it. Invalid or overlapping replacements reject without changing the active catalog. A lost acknowledgement closes the connection at the request deadline rather than leaving an unbounded pending update.

`bridge_list_tools({ sessionId })` discovers the current catalog/version. `bridge_describe_tool({ sessionId, name })` returns the current version and schema. `bridge_call_tool` requires the exact `sessionId` and `catalogVersion`; stale, removed, and schema-invalid calls are rejected before dispatch. Replacing a catalog invalidates outstanding calls from its previous version; an already-running mutation may still finish, so reread state rather than replaying it.

Schemas use JSON Schema 2020-12, synchronous validation at both boundaries, and local references only. Catalogs have unique names and are bounded to 64 tools/512 KiB. Malformed protocol messages and unsupported versions fail explicitly. No remote schema or image URL is fetched.

Plain JSON remains readable text, even if it contains a `data` field. The reserved `bridgeResultVersion` property selects the strict result-envelope contract; unsupported versions or malformed content are errors, not ordinary JSON. Images require runtime-validated PNG/JPEG MIME, canonical base64, and at most 4 MiB of decoded binary per image. The entire serialized result/message is bounded to 8 MiB, including text, metadata, and multiple images. Metadata accompanies actual MCP image blocks as readable text.

Errors distinguish missing/stale sessions, stale catalogs, unknown tools, invalid arguments/messages, unsupported versions, payload limits, handler failures, and timeouts. Arbitrary handler exception text is not forwarded; page error categories are allowlisted and mapped to bounded generic messages. Return application diagnostics as intentional structured JSON data instead of throwing secrets into error messages.

Initial pairing tokens remain single-use and the helper owns one page session. Catalog replacement does not add lifecycle authority: resume is limited to the exact scoped page/endpoint lease, and an explicit disconnect, helper restart, or expiry requires fresh pairing. Application-specific authoring remains outside this package.
