# Step 3.3 evidence

Implementation is complete for the app-local Phase 3 authoring boundary; the deployed/manual completion gate remains open pending user-assisted REPL verification.

Implemented:

- Added the browser-safe `AgentProvider`, connection affordance, and app route wiring. Pairing fragments are consumed before provider render, history is cleaned by the generic bridge, the original pairing value is kept only in memory, and the provider waits for both production CodeMirror editor ports before creating one bridge/controller.
- Added a stable catalog containing only `get_authoring_context`, `get_sketch`, and `update_sketch`. Reads clone current raw drafts; updates use the production authoring controller/editor registry, expected revisions, atomic source transactions, and structured conflict results.
- Added curated actual compiler language/composition/builtin context, editable uniform definition IDs/defaults/ranges, explicit Run semantics, and honest pre-Phase-4 preview status (`appliedRevision: null`, not tracked). Runtime uniform values and Phase 4 tools are not exposed.
- Documented the Nitro/Vercel deployment workflow boundary, exact approved-origin Pi registration command, cwd-local `.pi/mcp.json` behavior, and effective WebSocket CSP requirement.

Checks run:

- `pnpm --filter repl-web test` — passed, 56 native Node tests (including 3 authoring-tool boundary tests).
- `pnpm --filter repl-web check` — passed.
- `pnpm --filter repl-web lint` — passed.
- `pnpm --filter repl-web build` — passed; existing bundler `use client` warnings only.
- `pnpm --filter repl-web build:authoring-probe` — passed.
- `node --experimental-strip-types -e "import('./apps/repl-web/src/agent/context.ts')"` and a workspace `@shdr/agent-bridge/browser` import — passed without DOM globals.

Manual/deployed checks pending user assistance: pair the approved deployed REPL through Pi, inspect the three-tool catalog/context, read and update main/utils/uniform definitions, verify visible undo and manual Run behavior, provoke a stale manual-edit conflict, disconnect without losing the draft, and inspect URL/history, bridge-owned storage, and ordinary logs/telemetry. Do not close this evidence or the Phase 3 exit checkbox until those behaviors are reported by the user. No deployment, MCP config write, browser harness, or Phase 4 capability was added.
