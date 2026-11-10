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

The page removes pairing credentials from the URL fragment before connecting. Page refresh currently requires pairing again. To check image delivery, discover the page's tools and invoke its image tool; receiving base64 in text alone is not success. Localhost results do not replace testing the real HTTPS origin and its browser permissions/CSP.

This is the thin bridge slice: initial pairing tokens are single-use and the helper owns one page session. Full reconnect/resume semantics, cancellation propagation, catalog replacement, and application-specific authoring remain later-phase work.
