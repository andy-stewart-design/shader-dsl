# REPL Sketch Persistence Implementation Plan

## Governing source

- Governing spec: [spec.md](spec.md)
- Feature context: [overview.md](overview.md)

This plan is the execution contract. A checked task records work performed, not acceptance, approval, publication, or release. In supervised execution, keep manual approvals in extension state.

## Execution constraints

- Paths and commands are relative to the `shader-dsl` repository root unless noted. Preserve unrelated work. Keep library storage browser-only and separate from the draft, preview, and agent tool contracts. Prefer native IndexedDB and existing UI dependencies.
- Use the repository's Node ≥24 and pnpm 12.6.0. Manual checks use `pnpm --filter repl-web dev` at `http://localhost:3000` in a disposable browser profile with IndexedDB, downloads, and a working preview renderer. Use only that profile for fault injection, destructive checks, and test data. If access is unavailable, record the manual gate as blocked; do not substitute a build for browser evidence. No remote credentials, publishing, or deployment are required.
- No green baseline is assumed. Before implementation, run the existing REPL test command once and record any pre-existing failures in the first step's evidence. Distinguish them from new failures; escalate baseline problems that prevent meaningful verification.
- Keep browser checks manual-first. Add only focused automated checks for the file format; reuse the existing REPL suite for regression coverage. Do not introduce a browser automation suite.
- Routine plan edits are limited to task checkboxes. Scope, IDs, dependencies, gates, files, and acceptance mappings change only with explicit agreement; record that agreement and rationale in `evidence/changes.md`. Escalate a material spec conflict before affected work.
- Check a verification task only after the required checks and completion gate pass and concise evidence is recorded at the linked location. Leave failed, blocked, skipped, or waived checks unchecked and record the reason and follow-up. Evidence normally needs only the check, outcome, and any material caveat. Do not create empty evidence notes or duplicate evidence across gates.

## Phase overview and delivery boundary

| Phase | Outcome | Dependencies | Exit gate |
| --- | --- | --- | --- |
| 1 | Named snapshots can be saved explicitly and listed; dirty edits are protected on browser leave. | Local tooling and an isolated browser profile | Save, reload, and see committed entries only; the REPL stays usable with storage unavailable. |
| 2 | The dialog can open and manage sketches and move them by JSON file without losing unsaved work. | Phase 1 exit gate | Complete browser acceptance and pass the REPL regression, type, and build checks. |

Delivery boundary: one feature-complete PR. Steps are review slices, not separate releases. Keep the editor replacement, switch guard, and run-on-open wiring together in Step 2.1: none should expose a partially working Open path.

## Phase 1 — Save and list committed snapshots

Outcome: The REPL can keep named snapshots across reloads without turning Run or editing into a write operation.  
Depends on: Local prerequisites above.  
Review boundary: Browser data contract, explicit saving, dirty tracking, and a read-only library list. Opening, deletion, and file controls are not exposed until Phase 2.

### Step 1.1 — Lossless file contract and browser repository

Requirements / acceptance: R1, R2, R5; AC1 (durability only; Steps 1.2 and 2.1 own the browser flow), AC7 and AC8 (format and repository portions only; Steps 1.2, 2.1, and 2.3 own the UI paths).  
Depends on: None.  
Review boundary: Snapshot serialization and transactional CRUD, without routes or UI changes.

Expected files:

- `apps/repl-web/src/library/codec.ts` and `codec.test.ts` — add the v1 file contract and focused checks.
- `apps/repl-web/src/library/storage.ts` — add the browser-only IndexedDB repository, using the existing raw uniform types in `src/shared/uniforms.ts`.

Tasks:

- [x] Capture the existing REPL test baseline before changing code.
- [x] Implement the versioned codec, preserving Main, Utils, ordered uniform IDs, raw numeric strings, and both color fields. Validate the usable last-valid color with the existing color helper, not the agent schema. Reject malformed files, unknown versions, and invalid shapes before any write.
- [x] Add lazy, client-only IndexedDB list/read/create/update/rename/delete operations. Use fresh identities for creates, await transaction completion, distinguish empty/not-found from read failure, and surface aborted writes. Keep updates by ID from recreating a missing entry.
- [x] Add focused codec tests and satisfy the verification and completion gate below; record concise evidence.

Verification:

- Automated: from `apps/repl-web`, run `node --test --experimental-strip-types src/library/codec.test.ts` after adding it. Assert exact snapshot round trips, including incomplete inputs, and rejection of invalid JSON, unsupported versions, duplicate uniform IDs, and unusable fallback colors.
- Existing app check: run `pnpm --filter repl-web check`.
- Real-browser repository proof is deferred to the UI gates: Save/reload and record isolation in Step 1.2 and its phase exit, remaining CRUD in Steps 2.1–2.2, and an aborted-write persistence check at the Phase 2 exit.

Completion gate: Focused codec checks and the existing app check pass.  
Evidence location: [evidence/step-1.1.md](evidence/step-1.1.md).

### Step 1.2 — Explicit Save, library list, and dirty warning

Requirements / acceptance: R1, R2, R3; AC4; AC1 (save, list, and starter on reload; Open in Step 2.1), AC2 (explicit Save/copy; export in Step 2.3), AC8 (empty and storage-error display; failed Open and invalid import in Steps 2.1 and 2.3).  
Depends on: 1.1.  
Review boundary: Connect the existing editor header to Save and a simple accessible dialog; no draft replacement yet.

Expected files:

- `apps/repl-web/src/routes/index.tsx`, `src/components/editor-pane/index.tsx`, and `src/components/editor-pane/editor-header/index.tsx` — wire and label Save and library actions; remove unsupported shortcut hints.
- `apps/repl-web/src/hooks/use-sketch-library.ts` — add route-owned association, baseline, save/list state, and dirty-only leave warning.
- `apps/repl-web/src/components/sketch-library-dialog/index.tsx` — add list, naming, and empty/error states, following the existing in-app dialog pattern.
- `apps/repl-web/src/stores/draft.ts` — make the existing content comparison reusable without changing normal draft commits.

Tasks:

- [ ] Track the saved or starter baseline by exact draft content. Subscribe to draft changes, including agent edits; ignore revision-only differences. Attach `beforeunload` only while dirty and remove it when clean or unmounted.
- [ ] Implement named first Save, update by active ID, and Save as copy with a new ID and association. Commit the captured baseline only on successful writes; newer edits remain dirty. Keep the draft and association on failure.
- [ ] Present the saved list in an in-app dialog, with distinguishable duplicate names and distinct loading, empty, and error states. Keep editor and Run usable if storage fails.
- [ ] Satisfy the verification and completion gate below and record concise evidence.

Verification: In the disposable browser, save a sketch that includes a change in each editable section. Edit and Run without saving, verify IndexedDB still holds the saved input, then Save as copy and Save a further edit; only the copy changes. Reload and verify the starter opens clean and both entries are listed. Separately, after interacting with the page, try to leave with dirty changes, stay, revert exactly, and leave without a warning in a browser that supports it. With an empty store, check the empty state; use a temporary browser-local IndexedDB read/write failure to verify visible errors and continued editing/Run.

Completion gate: Save and copy affect only the intended entries, dirty-only leave warnings work, and storage failure does not appear as an empty list or successful save.  
Evidence location: [evidence/step-1.2.md](evidence/step-1.2.md).

Phase exit gate: After Step 1.2, run `pnpm --filter repl-web check`. With the new header and dialog, save a named sketch, make an edit without saving, leave and return, and verify the list contains only the committed snapshot and the editor starts on the starter. Record the integration outcome in Step 1.2 evidence before Phase 2.

## Phase 2 — Open, manage, and move sketches

Outcome: The library dialog provides the complete v1 workflow, including safe switching, preview behavior, rename/delete, and individual import/export.  
Depends on: Phase 1 exit gate.  
Review boundary: Complete the in-browser workflow without a dedicated library route, server persistence, or new agent operations.

### Step 2.1 — Guarded New/Open and run-on-open

Requirements / acceptance: R1–R4; AC1, AC3, AC5; AC6 (switch/Undo portion; deletion in Step 2.2), AC8 (failed Open portion; remaining cases in Steps 1.2 and 2.3).  
Depends on: 1.2 and the Phase 1 exit gate.  
Review boundary: Change the active draft and its preview coherently. Do not change existing agent replacement rules or agent undo semantics.

Expected files:

- `apps/repl-web/src/editor/create-editor.ts`, `src/editor/authoring-adapter.ts`, and `src/hooks/use-code-editor.ts` — add the fresh-history replacement seam; late editor mounts read the committed draft.
- `apps/repl-web/src/hooks/use-sketch-library.ts` and `src/components/sketch-library-dialog/index.tsx` — coordinate New/Open, custom guard, and error handling.
- `apps/repl-web/src/routes/index.tsx`, `src/hooks/use-shdr-compilation.ts`, `src/agent/apply-controller.ts`, and `src/components/preview-pane/index.tsx` — connect the switch to the existing apply pipeline and show pending/failed preview status without changing the agent API.
- `apps/repl-web/README.md` — document the exception to manual Run and the no-autosave behavior.

Tasks:

- [ ] Add a dedicated whole-draft replacement operation. Stage both mounted editors, reset their histories, and commit sources and uniforms together. On failure, keep the previous editors and draft; a later mount reads the committed draft. Preserve normal editing, shortcuts, and the existing agent path.
- [ ] Add New and Open with the custom Save / Discard / Cancel guard. Fetch the target after a Save decision (including when opening the same entry); only replace after all target inputs are ready. Recheck for newer edits, including agent mutations, before committing a pending switch. Canceling naming, failed writes, and failed target reads must not discard work.
- [ ] Run the opened snapshot once after successful replacement. Use the existing awaitable apply path; prevent earlier Run/Apply completions and the initial frame from being identified as a successful preview of the new sketch. Surface compile, install, or draw failure without undoing the open. Later edits still need Run.
- [ ] Satisfy the verification and completion gate below and record concise evidence.

Verification:

- Automated regression: run `pnpm --filter repl-web test`; existing draft/editor and agent apply assertions must not regress.
- Manual: Open after reload with edits across Main, Utils, and uniforms; inspect both editor tabs and confirm one Run (use a breakpoint/logpoint at the apply entry if needed). Switch between sketches, including with a hidden tab, and verify Undo cannot bring back the preceding sketch. Try New/Open with Cancel, Discard, Save, canceled naming, same-entry Save and Open, a failed save, and a failed target read. Inject failures in the disposable session at the IndexedDB transaction/read boundary; temporarily defer a storage operation and confirm a newer edit survives a pending switch.
- Manual preview: with a valid render visible, open a saved broken sketch, fix it, and verify nothing runs or writes until explicitly requested. Confirm Run still works after the fix. Also exercise an overlapping earlier apply and force one install or draw rejection with a browser-local override at the preview port; earlier frames must not clear or masquerade as the new sketch's pending/failed preview. Remove local overrides before the phase gate.

Completion gate: New/Open do not partially change or silently discard the draft, Undo does not cross the boundary, and Open performs exactly one honest Run. Existing agent and manual Run behavior is preserved.  
Evidence location: [evidence/step-2.1.md](evidence/step-2.1.md).

### Step 2.2 — Rename and confirmed deletion

Requirements / acceptance: R1–R3; AC6 (deletion portion; switch/Undo in Step 2.1), AC7 (rename portion; portability in Step 2.3).  
Depends on: 2.1.  
Review boundary: Manage committed metadata and remove entries without overwriting the live draft.

Expected files:

- `apps/repl-web/src/components/sketch-library-dialog/index.tsx` and `src/hooks/use-sketch-library.ts` — row-scoped rename, delete confirmation, refresh, and active-entry detachment.

Tasks:

- [ ] Rename by ID and update the label without changing the saved contents or dirty baseline.
- [ ] Add a confirmation that identifies the selected entry, even when names are duplicated. Detach the active draft only after a successful delete; leave its input and preview intact and compare it to the starter baseline. Canceling or a failed write leaves the association unchanged.
- [ ] Satisfy the verification and completion gate below and record concise evidence.

Verification: Create two same-named records with different inputs. Rename one and reopen it to verify its inputs are unchanged. Cancel deletion of the active entry, then simulate a delete failure and confirm it stays in the list and Save still targets it. Finally delete it, confirm the other entry and active draft/preview are unchanged, and Save the detached draft as a new entry.

Completion gate: Rename is metadata-only; cancel and failed delete are non-destructive; confirmed deletion affects only the selected entry.  
Evidence location: [evidence/step-2.2.md](evidence/step-2.2.md).

### Step 2.3 — Import and export one saved sketch

Requirements / acceptance: R5; AC2 (saved-only export; copy behavior in Step 1.2), AC7 (portability portion; rename in Step 2.2), AC8 (invalid files; storage and switch failures in Steps 1.2 and 2.1).  
Depends on: 2.2.  
Review boundary: File handling in the library dialog; no changes to the active draft or preview.

Expected files:

- `apps/repl-web/src/components/sketch-library-dialog/index.tsx` and `src/hooks/use-sketch-library.ts` — file picker, download, and visible result/error states using the Step 1.1 codec and repository.
- `apps/repl-web/README.md` — explain single-sketch JSON and browser-local storage limits.

Tasks:

- [ ] Export the selected committed record as v1 JSON, with no local metadata and no reads from the live draft.
- [ ] Validate imports before creating a new record; do not overwrite a same-named entry, replace the current draft, or run the imported source. File-picker cancellation does nothing; report validation or transaction failures.
- [ ] Satisfy the verification and completion gate below and record concise evidence.

Verification: Export an entry while the editor has unsaved changes and inspect the download for the committed values. Reimport with the same name while the draft is dirty; check the new row appears and that the editor, warning state, and preview have not changed. Open the imported record and confirm a lossless round trip for incomplete uniform input. Try malformed JSON, an unsupported version, and an invalid uniform shape; show errors without adding rows. Re-run the focused codec test from Step 1.1.

Completion gate: Browser download and file selection work, imports create independent entries, and invalid files or export/import actions cannot overwrite editor work.  
Evidence location: [evidence/step-2.3.md](evidence/step-2.3.md).

Phase exit gate: After Step 2.3, run `pnpm --filter repl-web test`, `pnpm --filter repl-web check`, and `pnpm --filter repl-web build`; require successful app regression, type/docs checks, and SSR build. In the disposable browser without overrides, Save a sketch, reload, reopen and see it render, export then import a copy, and verify the original stays intact. In the disposable profile, explicitly abort a write transaction before commit, confirm the write reports failure and the previously persisted data remains intact, then remove the override. Together with the earlier UI gates, confirm durable, independent records and CRUD behavior in real IndexedDB. Review the full acceptance mapping below before requesting approval to advance. Record the integrated browser and command outcomes in Step 2.3 evidence; a build does not replace manual acceptance.

## Final acceptance

| Spec acceptance ID | Owning step / gate | Verification and expected result | Evidence location |
| --- | --- | --- | --- |
| AC1 | 2.1 and Phase 2 exit | Save, reload, and open: the default is clean at startup; the stored inputs restore and run once. | [2.1](evidence/step-2.1.md), [Phase 2 exit](evidence/step-2.3.md) |
| AC2 | 1.2 + 2.3 | Run alone writes nothing; Save as copy is independent; export contains only committed inputs. | [1.2](evidence/step-1.2.md), [2.3](evidence/step-2.3.md) |
| AC3 | 2.1 | The custom guard protects dirty content through cancellation, a failed write, and a failed switch. | [2.1](evidence/step-2.1.md) |
| AC4 | 1.2 | Exact revert clears the leave warning; reload doesn't restore unsaved work or overwrite a saved record. | [1.2](evidence/step-1.2.md) |
| AC5 | 2.1 | Broken sketches remain editable; an older preview is not called successful and later edits don't rerun or save. | [2.1](evidence/step-2.1.md) |
| AC6 | 2.1 + 2.2 | Undo cannot cross sketches; deletion is confirmed and detaches without replacing the draft. | [2.1](evidence/step-2.1.md), [2.2](evidence/step-2.2.md) |
| AC7 | 2.2 + 2.3 | Rename affects labels only; reimport is lossless and independent. | [2.2](evidence/step-2.2.md), [2.3](evidence/step-2.3.md) |
| AC8 | 1.2 + 2.1 + 2.3 | Empty, read/write failure, and invalid-file outcomes are distinct; no data is discarded on failure. | [1.2](evidence/step-1.2.md), [2.1](evidence/step-2.1.md), [2.3](evidence/step-2.3.md) |

## Rollback and recovery

This is a new browser store, not a migration. Revert the feature as a unit if needed; do not clear IndexedDB on rollback. Older app code will not expose the library. Export important sketches before rolling back if access must be preserved outside the app. Confirmed deletion cannot be undone unless the user has an exported copy. If a Save commits but the subsequent Open fails, retain the current draft and the newly committed save; do not try to roll back the successful write.

## Planned deferred checks

- No automated browser matrix, mobile leave-warning guarantee, or cross-tab conflict testing. The manual acceptance proves one supported browser profile; it does not prove those deferred behaviors.

Execution-time blockers, skipped checks, and agreed changes belong in the predetermined evidence notes, not in this plan's status fields.
