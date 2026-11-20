# REPL Sketch Persistence Specification

## Status

- Readiness: Ready for planning
- Blocking decisions: None
- Overview: [overview.md](overview.md)
- Source: Sketch persistence design interview and follow-up on the library dialog and manual testing.

## Problem and intended outcome

The web REPL lets people edit and run sketches but cannot keep more than the current in-memory draft. A user should be able to intentionally save multiple named sketches, find and reopen them after a reload, and move an individual sketch between browser profiles using a JSON file.

## Scope

- A browser-local IndexedDB library, surfaced in one in-app dialog.
- Explicit Save and Save as copy, basic library management, and one-sketch JSON import/export.
- Warnings before replacing unsaved work and an automatic Run when a saved sketch opens.

Non-goals: autosave or draft recovery, restoring the last open sketch at startup, revision history, bulk backup, thumbnails, accounts, sync, publishing, or new agent tools.

## Current behavior and evidence

Static inspection only; no runtime verification was done for this spec.

- The [draft store](../../apps/repl-web/src/stores/draft.ts) holds Main, Utils, ordered uniform drafts, and a revision. [Uniform drafts](../../apps/repl-web/src/shared/uniforms.ts) preserve raw strings, including incomplete input and a color's last valid value. The [agent authoring schema](../../apps/repl-web/src/agent/authoring-schema.ts) is not a lossless substitute for that shape.
- The [editor header](../../apps/repl-web/src/components/editor-pane/editor-header/index.tsx) has an unwired Save button. The [editor hook](../../apps/repl-web/src/hooks/use-code-editor.ts) initializes live CodeMirror documents from the draft; a store-only update does not replace mounted editor documents.
- [Run and agent Apply](../../apps/repl-web/src/hooks/use-shdr-compilation.ts) share an [apply pipeline](../../apps/repl-web/src/agent/apply-controller.ts). A compile failure can leave the previous preview visible. Editing remains separate from running; the one deliberate change is that opening a saved sketch also requests one Run.

## Requirements and invariants

- **R1 — Local library:** Users can list, open, rename, and delete named sketches in a dialog. Successfully committed entries survive reload in the same browser profile and site origin.
- **R2 — Explicit Save:** Save creates or updates a saved entry; Save as copy creates an independent entry. Neither editing nor running a draft writes it to the library. A saved snapshot preserves authoring input even if it does not compile.
- **R3 — Protect unsaved work:** In-app actions that replace a dirty draft require a custom Save / Discard / Cancel dialog. A dirty page requests the native browser leave warning. Failed or canceled actions must not discard the draft.
- **R4 — Open and run:** Opening installs the complete saved snapshot into the editors and draft, then runs it once. If that run fails, the snapshot stays open and the preview must not be presented as a successful render of it.
- **R5 — Portable file:** Users can export a saved entry and import a versioned single-sketch JSON file. Import never overwrites an existing entry or replaces the current draft.

## Behavior and contracts

### Draft, save, and switching

- The app starts with the existing starter draft, clean and unassociated with a saved entry. **New** returns to that starter as an unassociated draft. Dirty means the editable content differs from the current saved baseline or from the starter baseline for a new draft. Compare Main, Utils, and the ordered editable uniform fields, not the revision, name, or last run result. Reverting edits to the baseline makes the draft clean again.
- **Save** prompts for a nonblank name if the draft is not associated with an entry; otherwise it updates the associated entry. **Save as copy** asks for a name, creates a fresh entry from the current draft, and associates the editor with that copy. Association and the saved baseline change only after the write commits. If saving fails, report the error and keep the current association and edits. Names are not identities; duplicate names are allowed and library rows must be distinguishable.
- Before **New** or **Open** replaces a dirty draft, the in-app dialog offers **Save**, **Discard**, and **Cancel**. Save continues only after a successful save (including naming if needed); canceling naming stops the switch. Discard authorizes that replacement only: if opening the target fails, retain the existing draft. Cancel leaves the editor and library entries unchanged. If the user makes newer edits while a save or switch is pending, they must not be silently discarded. Choosing Save while opening the same entry opens the newly saved contents.
- Register `beforeunload` only while dirty. The browser controls the prompt and may not show it. No unsaved content is written as part of leaving the page.

### Library management and opening

- **Rename** changes only the selected entry's name. **Delete** requires confirmation that identifies the entry. Deleting the active saved entry leaves its draft and preview in place, detaches it from the deleted entry, and treats it as unsaved relative to the starter baseline; a later Save creates a new entry. A failed delete does not detach it.
- **Open** and **New** replace both live editor documents and the uniform draft as one coherent authoring change. Start a fresh editor undo history so Undo cannot pull text from the previously open sketch. On **Open**, after the draft is installed and attached to its saved baseline, run that snapshot once through the normal preview path. A compile, install, or draw error must be visible; if any previous preview remains, indicate that it is not a successful run of the opened sketch. Subsequent edits still require explicit Run.
- Distinguish an empty library from a library that cannot be read. Show storage failures without claiming success; editing and manual Run remain available.

### JSON import/export

- The v1 file is a JSON object with `format: "shdr-sketch"`, `version: 1`, a nonblank string `name`, string `main` and `utils`, and an ordered `uniforms` array. Each uniform has a unique nonempty string `id`, a string `name`, a `type`, and the corresponding editable string fields: `value`, `min`, `max` for `float`; `draft`, `valid` for `color`. The last-valid color must be usable as a fallback. Do not normalize away incomplete editable strings or require shader compilation for a valid file. Local entry IDs and library metadata are not part of the format.
- **Export** writes the selected saved snapshot, not any unsaved edits in the editor. **Import** validates structure and version before writing. A valid file becomes a new entry with a fresh local ID, even if its name already exists. Malformed JSON, unsupported versions, and invalid shapes produce a visible error and leave the library and active draft unchanged. Import does not open or run the sketch.

## Ownership and boundaries

The browser library owns committed snapshots and entry identities; the live draft and editors own unsaved inputs; the preview owns runtime and compilation state. Storage access is client-only. Do not persist preview artifacts, diagnostics, preferences, editor history, or agent pairing credentials. There is no server dependency or new agent-facing library access; existing agent draft edits, like manual edits, can make the draft dirty without saving it.

## Acceptance criteria

Manual browser verification is primary. Keep automated coverage lean; small checks for file validation and lossless round-tripping provide the most value without a new UI automation suite.

| ID  | Requirements | Starting condition / action                                                                                                                     | Expected outcome                                                                                                                                                                                                             | Verification                     |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| AC1 | R1, R2, R4   | Save a starter variant with distinct Main, Utils, and uniforms; reload, open the library, and select it.                                        | Reload starts clean on the starter; the entry is listed and opening restores all inputs and runs it once.                                                                                                                    | Manual                           |
| AC2 | R1, R2, R5   | Edit and Run an open sketch without saving; export its record, then Save as copy, and Save another edit to the copy.                            | The file and original entry contain only the original saved values. The separate copy is active and receives later saves.                                                                                                    | Manual                           |
| AC3 | R3           | With dirty edits, try New or Open and exercise Cancel, Discard, and Save, including a canceled name prompt and a failed save.                   | Only Discard with a successful switch or Save after a committed write permits replacement; otherwise the edits remain.                                                                                                       | Manual                           |
| AC4 | R2, R3       | Edit and then exactly revert; try to leave both before and after the revert in a browser that supports the warning.                             | Dirty edits request the browser warning; clean edits do not. No recovery draft or overwritten entry appears on reload.                                                                                                       | Manual                           |
| AC5 | R2, R4       | While a good preview is visible, open a saved non-compiling sketch. Then repair its code without pressing Run.                                  | The opened source and uniforms remain editable, an error explains the failed Run, and any old preview is clearly not from that sketch. Repairing the draft neither reruns nor saves it; Run can still be invoked explicitly. | Manual                           |
| AC6 | R1, R3, R4   | Start editing one sketch, discard those edits to open another, then try Undo. Separately, cancel and then confirm deletion of the active entry. | Undo does not restore the other sketch's text. Canceled deletion changes nothing; confirmed deletion removes only that saved entry and keeps the live draft, which can be saved as new.                                      | Manual                           |
| AC7 | R1, R5       | Rename a saved entry; export and reimport it while another draft is dirty, including raw incomplete uniform inputs in the file.                 | Rename changes only the label. Import creates an independent entry with the same saved inputs, without overwriting a same-named entry or disturbing the dirty draft.                                                         | Manual; focused format check     |
| AC8 | R1, R3, R5   | Open an empty library, try malformed or unsupported files, and simulate an IndexedDB read or write failure.                                     | A readable empty library shows an empty state. Invalid files add nothing. Storage errors are visible rather than shown as an empty library or successful write; a failed Open retains the current draft.                     | Manual; focused validation check |

## Assumptions

- The interview explicitly settled explicit Save and Save as copy, custom replacement warnings, a dirty-only browser warning, no autosave, run-on-open, a library dialog, simple import/export, and a manual-first verification approach.
- Defaults carried forward from the wrap-up or filled in here: reuse the starter on New and startup; provide Rename/Delete within the dialog; attach to a newly saved copy; allow duplicate names; and import/export one saved sketch at a time. These are v1 defaults rather than separately confirmed preferences. Check that the manual dialog walkthrough is clear without adding a dedicated library page.

## Risks and open decisions

- **Blocking:** None.
- **Non-blocking:** Site-data clearing or browser eviction can remove the library; JSON export is the manual copy. The native leave warning is best-effort, especially on mobile. Concurrent edits to one entry in multiple tabs have no conflict-resolution guarantee.

## Deferred work

Bulk backup, multi-tab conflict handling, draft recovery, reopening the last sketch, and cross-device sync are deferred.
