# Step 5.2 — Packed helper and browser artifact boundaries

Status: **Step 5.2 is complete.** The actual tarball now installs and runs from an isolated consumer outside the checkout; the CLI/MCP image path, SSR/public exports, and installed browser bundle boundary all passed. Step 5.3 remains unchecked and was not started.

## Prior offline blocker and user install

The first worker attempt preserved the offline gate and stopped at the actual missing cache entry:

```text
pnpm add --offline --ignore-scripts /var/folders/.../shdr-agent-bridge-0.0.0.tgz
ERR_PNPM_NO_OFFLINE_TARBALL
Failed to fetch tarball for hono@4.13.18 from https://registry.npmjs.org/hono/-/hono-4.13.18.tgz
snapshot not present in local store
```

No worker online fallback, cache manipulation, global installation, publication, or permanent agent configuration was used. The user then independently performed the network installation and confirmed it was done with this exact command from the prepared consumer:

```text
cd /tmp/shdr-agent-bridge-packed.pY9U10/consumer; pnpm add --ignore-scripts ../shdr-agent-bridge-0.0.0.tgz
```

Before rerunning the verifier, the installed package was present at `/tmp/shdr-agent-bridge-packed.pY9U10/consumer/node_modules/@shdr/agent-bridge`, version `@shdr/agent-bridge@0.0.0`, with the executable at `node_modules/.bin/shdr-agent-bridge`. Their real paths were inside `/private/tmp/shdr-agent-bridge-packed.pY9U10/consumer/node_modules/.pnpm/...`, outside the checkout and not symlinks to repository source. The installed dependency graph reported by pnpm was `@modelcontextprotocol/sdk@1.30.1`, `ajv@8.20.0`, `ws@8.23.0`, and `zod@4.6.7`; the user-installed consumer was used only for this preflight proof, not as a substitute for the clean verifier install.

## Implementation and focused fix

- `packages/agent-bridge/test/verify-packed.mjs` now accepts pnpm's isolated virtual-store dependency layout. The original post-install assertion looked only under `consumer/node_modules`, although pnpm had correctly placed the package dependencies in the virtual package's sibling `node_modules` directory. The fix checks the normal root, pnpm's hoisted virtual-store directory, and the installed package's virtual-store dependency directory, while retaining the outside-checkout assertion. This was a verifier portability bug, not a product or dependency-missing fix.
- The verifier packs the real package, audits the tarball whitelist and metadata, performs a fresh `pnpm add --offline --ignore-scripts` in a temporary consumer, and never enables online fallback.
- It then imports the installed root/protocol/browser/server public entries in Node without browser globals; starts the installed executable through the standard MCP stdio client; authenticates a loopback WebSocket with the configured HTTPS origin; checks protocol/session/catalog/limit guards; performs list/describe/call validation; and returns an actual PNG MCP image block with readable metadata from a fake page implemented with Node `ws`.
- The installed browser entry is bundled from the temporary consumer using the existing Vite tooling. Its module audit and emitted JavaScript reject checkout/source resolution, MCP SDK, `ws`, server/bin modules, and Node builtins. The browser path is therefore an installed-artifact boundary check, not a workspace alias or source import.

## Checks and actual outcomes

- `pnpm --filter @shdr/agent-bridge test:packed` — passed. This ran `pnpm build` followed by the unchanged offline verifier. Actual result: `packed artifact verified: 28 files, isolated consumer, CLI/MCP image, SSR exports, browser boundary`.
- The verifier exercised five staged boundary cases: 28-file artifact audit/metadata and executable checks; clean offline tarball install/dependency graph; installed SSR/public-export imports; installed CLI stdio + loopback auth/catalog/list/describe/invalid-call/PNG-image response; and installed browser bundle/module-graph boundary. The image fixture was a valid 1×1 PNG; evidence records delivery and metadata checks, not image payload data.
- `pnpm --filter @shdr/agent-bridge test` — **37/37** tests across 7 files passed.
- `pnpm --filter @shdr/agent-bridge check` — passed.
- `pnpm --filter @shdr/agent-bridge build` — passed on Node `v24.21.0`; tsdown targeted `node24.0.0`, emitted the `.mjs`/`.d.mts` public outputs and maps, and granted `dist/bin.mjs` execute permission.
- `node --check packages/agent-bridge/test/verify-packed.mjs` — passed.
- `git diff --check` — passed.

The verifier's temporary directory was absent after the successful run, and no bridge/Vite/helper process remained. After all handles were closed and the installed preflight was recorded, the exact user-owned temporary tree `/tmp/shdr-agent-bridge-packed.pY9U10` was inspected as the expected scoped path and cleaned up; the repository `packages/agent-bridge/dist` and shared pnpm cache were not removed. No live MCP root helper, model call, browser launch, publication, deployment, global install, or permanent configuration was used.

The completion gate is closed for the packed artifact prerequisite. Real client compatibility and model-visible image acceptance remain Step 5.3 work and are intentionally not claimed here.
