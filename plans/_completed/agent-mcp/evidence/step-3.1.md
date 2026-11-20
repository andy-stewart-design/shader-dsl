# Step 3.1 — Revisioned atomic draft commands and definition schemas

## Implementation

- Added `revision` to the draft store. Manual `setSource`/`setUniforms` edits, including invalid intermediate definition strings, advance it once per actual change; true no-ops do not. Uniform arrays are cloned on storage. `createDraftStore()` provides an isolated test seam while the existing hook/actions remain the production manual path.
- Added the internal synchronous `actions.commit({ main?, utils?, uniforms? })` boundary and `createAuthoringController(store?)`. The controller accepts a nonempty subset of full `main`/`utils` strings and a complete uniform-list replacement, checks a finite integer expected revision, validates every requested field first, then performs one Zustand commit. Stale, malformed, duplicate, reserved, non-finite, out-of-range, or invalid-color requests leave every field and revision unchanged. Source text is not compiled during authoring.
- Added TypeScript wire types, normalization, read mapping, and `authoringUpdateJsonSchema` plus the mirrored `src/agent/authoring-schema.json`. Reads preserve raw editable drafts; color `value` is the draft string and writes derive the internal valid cache. Existing IDs are preserved when supplied (or for an omitted same-name item), new items receive collision-free `uniform-N` IDs, and unknown supplied IDs are rejected as controller-owned. No transport, window global, tool registration, CodeMirror write, Apply, or runtime change was added.

## Focused verification

The existing source tests use Node's native test runner rather than the repository root Vitest include (`test/**/*.test.ts`). The smallest genuine package runner is therefore the new Node 24 script; this is an implementation-default correction based on the baseline source imports, not a broad test migration.

- `pnpm --filter repl-web test` — passed, **48 tests** across existing compiler/editor/uniform/preview tests plus draft/controller coverage.
- `pnpm --filter repl-web check` — passed.
- `pnpm --filter repl-web lint` — passed.
- `pnpm --filter repl-web build` — passed. Existing Rolldown warnings about preserving dependency `use client` directives were emitted; no new failure was introduced.
- `pnpm exec prettier --check ...` — passed for changed source/package/docs files after formatting.

Coverage includes manual revision/no-op behavior, invalid raw reads, isolated stores, one-notification multi-field commits, omission preservation, stale/invalid atomic failures, source updates without compilation, clone isolation, definition add/delete/rename/type/default/range changes, ID preservation/allocation/unknown-ID rejection, duplicate names/IDs, reserved names, f32/range/color validation, and derived color caches. No root test command or browser/runtime lifecycle was run.

## Gate status

The user completed the requested normal source/uniform editing and Run check and reported, “Yeah, seems to all still be functional.” Their screenshot shows a shader using authored color/float uniforms (`u.c1 * u.f1`), visible runtime controls, and a rendered blue preview. This is user-assisted browser regression evidence, not an automated browser walkthrough. Together with the focused checks above, Step 3.1's completion gate is satisfied. This does not claim programmatic CodeMirror integration, remote tools, or any Phase 3.2–4 work.
