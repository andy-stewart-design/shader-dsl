# Step 3.3 evidence

Implementation and the deployed/manual Phase 3 authoring gate are complete for the scoped prototype.

Implemented:

- Added the browser-safe `AgentProvider`, connection affordance, and app route wiring. Pairing fragments are consumed before provider render, history is cleaned by the generic bridge, the original pairing value is kept only in memory, and the provider waits for both production CodeMirror editor ports before creating one bridge/controller.
- Added a stable catalog containing only `get_authoring_context`, `get_sketch`, and `update_sketch`. Reads clone current raw drafts; updates use the production authoring controller/editor registry, expected revisions, atomic source transactions, and structured conflict results.
- Added curated actual compiler language/composition/builtin context, editable uniform definition IDs/defaults/ranges, explicit Run semantics, and honest pre-Phase-4 preview status (`appliedRevision: null`, not tracked). Runtime uniform values and Phase 4 tools are not exposed.
- Documented the Nitro/Vercel deployment workflow boundary, exact approved-origin Pi registration command, cwd-local `.pi/mcp.json` behavior, and effective WebSocket CSP requirement.

Required Phase 3 exit checks:

- `pnpm --filter repl-web test` — passed, **56 native Node tests** (including the authoring-tool boundary tests).
- `pnpm --filter repl-web check` — passed.
- `pnpm --filter repl-web lint` — passed.
- `pnpm --filter repl-web build` — passed; existing bundler `use client` warnings only.
- `pnpm --filter @shdr/agent-bridge check` — passed.
- `pnpm --filter @shdr/agent-bridge test` — passed, **33 tests across 7 files**; its existing `pretest` build also passed.

The earlier scoped checks remain recorded: `pnpm --filter repl-web build:authoring-probe` passed, and the browser-safe context/workspace bridge import checks passed without DOM globals. No full-workspace or runtime/browser-download lifecycle was run.

## Deployed authoring journey

The parent observed the following directly through MCP against the approved hosted REPL at `https://shdr-repl.vercel.app/`:

- `list_tools` advertised only `get_authoring_context`, `get_sketch`, and `update_sketch`; no Run, capture, runtime, publish, or eval tool was advertised.
- The initial context/sketch read was revision 0 with the default-gradient `main`, empty `utils`, no uniforms, and honest pre-Phase-4 preview state (`appliedRevision: null`, preview not tracked).
- One atomic `update_sketch` with `expectedRevision: 0` changed `main` to `// Agent authoring check: press Run to apply.\nreturn vec4(u.agentColor * u.agentBrightness, 1);`, set `utils` to a harmless comment, and created `color` uniform `agentColor` (`#ff7700`) and `float` uniform `agentBrightness` (`0.8`, range `0`–`1`). The response was successful at revision 1 with allocated IDs. No agent Run or image capture is claimed.

The user then confirmed the visible source/definition changes and pressed the normal manual Run; they reported the orange preview was correct. After a refresh used as an additional test, the app draft reset as expected. The generic connection resumed, and the agent reread the fresh session/revision before reapplying the same atomic update at revision 1. The saved pre-edit `main` was the default-gradient baseline.

For undo/conflict behavior, the user reported Cmd+Z in MAIN worked. Subsequent live `get_sketch` observations showed `main` exactly equal to the pre-edit baseline while the `utils` comment and uniform definitions remained, demonstrating source undo rather than whole-sketch undo. Revision observations advanced through the user's manual history actions (queries observed revisions 3 and 4 while the user was active); no exact one-step count or bug claim is made. A stale update using `expectedRevision: 1` returned, without mutation, `{ok:false,error:{code:"conflict",message:"Expected draft revision 1, but current revision is 3.",currentRevision:3}}`; exact before/after snapshots were unchanged. A later query at revision 4 still had baseline `main`. A temporary snapshot showing `mainRestored: false` while the user was editing was not treated as a failure.

The user was asked to disconnect without refreshing and reported that `main`, `utils`, and uniforms remained and normal Run still worked (“Yep, all good”). The parent then directly observed `get_connection_info` reporting `unpaired` with no active session. No draft-data erasure was observed and agent authority was revoked.

The visible Run, undo, and retained-draft statements above are user-reported browser observations; tool catalog, reads, writes, revision/conflict responses, and post-disconnect connection state are direct MCP observations. No credentials, pairing links, or session IDs are recorded here. The user did not perform an independent browser history/storage/telemetry audit, and the exact Chrome version was not collected. Accordingly, this evidence does not claim such an audit or credential absence from every browser surface; it relies on the existing source/test boundary and the approved R17 exception that a bridge-owned scoped resume credential may remain in `sessionStorage` while connected. Initial pairing-token durability is not claimed.

## Step 3.3 and Phase 3 exit gate

Passed for the Phase 3 prototype scope: the required REPL and generic-bridge checks passed, and the deployed three-tool authoring journey demonstrated fresh reads, atomic source-plus-definition writes, visible manual Run, visible source undo with retained omitted fields, stale-revision rejection without mutation, and disconnect without observed draft loss. This closes Step 3.3 and the Phase 3 exit gate for the documented scope.

Phase 4 apply/diagnostics/capture capabilities were not implemented or tested here; AC17–AC21 and multi-client compatibility are not claimed. This is a prototype Phase 3 gate, not production security certification. Generic protocol/metadata behavior remains unchanged.
