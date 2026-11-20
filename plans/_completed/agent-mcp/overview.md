# Agent MCP Bridge Overview

## Purpose and intended change

Let an external coding agent help author and review a sketch in the same deployed REPL tab its developer is using. The agent gets meaningful operations on source, uniform definitions, compilation, and preview images rather than trying to automate the editor's DOM.

The connection is reusable: each integrated website owns its application tools, while a generic browser client library and local MCP helper carry requests and results. The [specification](spec.md) is authoritative for behavior and boundaries.

## How it is used

Open the deployed REPL and start an MCP-capable agent such as Pi. The agent launches the local helper and can present a pairing link. Connect the tab, then ask for a change or review normally; a same-origin refresh in that tab may resume the connection while the helper is still running. The agent can inspect the sketch, edit source and uniform definitions, apply the result, and inspect the rendered image.

No local REPL development server is involved. Pairing enables communication; the agent still follows the user's requests rather than starting work on its own.

## Mental model

```text
Pi / Claude Code / Codex
          |
       stdio MCP
          |
   Generic local helper
          |
 Authenticated loopback WebSocket
          |
 Generic browser client library
          |
 Deployed site's own tool handlers
          |
   Editor / compiler / preview
```

The helper handles agent-facing protocol and result conversion, including real image responses. The browser library handles the page connection and generic tool dispatch. The REPL implements authoring behavior against its own state. Another integrated site can provide different tools without changing the bridge.

This direct approach does not depend on WebMCP, a Chrome extension, browser remote debugging, or a hosted relay.

## Scope and non-goals

- In scope: main/utils authoring, uniform-definition changes, diagnostics, Apply, preview capture, and safe coexistence with manual editing.
- Out of scope: direct runtime-control manipulation, saving/deleting/publishing sketches, simultaneous agents editing a tab, and an embedded agent or custom approval system.

## Related documents

- Specification: [spec.md](spec.md)
- Implementation plan: [plan.md](plan.md)
