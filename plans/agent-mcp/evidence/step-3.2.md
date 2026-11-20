# Step 3.2 evidence

Implementation and the user-assisted visible-DOM completion gate are complete.

- Added `EditorHandle` read/replace/readiness/undo/redo methods and history-preserving CodeMirror transactions annotated as programmatic and isolated in history. The production `useCodeEditor`/`CodeEditor` path registers the actual mounted handles in the app-local adapter registry.
- The controller preflights the expected revision, complete semantic payload, and every requested mounted editor before dispatch. It batches feedback, commits one draft revision, preserves omitted documents, and restores staged editor ports on dispatch failure. Uniform definitions remain store edits; source replacements are undoable editor history events.
- Added injectable multi-document tests for readiness/preflight, one subscriber notification, rollback on a later dispatch failure, and omitted fields, plus a real CodeMirror `EditorState` history/annotation undo/redo test.

Checks run:

- `pnpm --filter repl-web test` — passed, 53 tests.
- `pnpm --filter repl-web check` — passed.
- `pnpm --filter repl-web lint` — passed.
- `pnpm --filter repl-web build` — passed; existing bundler `use client` warnings only.
- `pnpm --filter repl-web build:authoring-probe` — passed.

User-assisted manual verification passed: after running the authoring probe and being asked to exercise visible sample edits, Undo/Redo, stale conflicts, and Utils unmount/mount rejection, the user reported, “Cool, yeah, this all seems to be working.” The unmount scenario was clarified as removing the editor handle without deleting source, then rejecting the entire multi-document update. This is user-reported browser evidence, not automated DOM coverage. Together with the scoped checks above, Step 3.2's completion gate is satisfied; remote tool exposure remains Step 3.3.
