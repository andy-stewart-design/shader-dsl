import assert from "node:assert/strict";
import test from "node:test";
import { history, isolateHistory, redo, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { programmaticEdit } from "./create-editor.ts";

function runCommand(
  command: typeof undo,
  state: EditorState,
): EditorState {
  let next: EditorState | undefined;
  assert.equal(
    command({
      state,
      dispatch: (transaction) => {
        next = transaction.state;
      },
    }),
    true,
  );
  if (!next) throw new Error("CodeMirror command did not dispatch");
  return next;
}

test("programmatic editor transactions are real, isolated history events", () => {
  const before = EditorState.create({
    doc: "before",
    extensions: [history()],
  });
  const transaction = before.update({
    changes: { from: 0, to: before.doc.length, insert: "after" },
    annotations: [programmaticEdit.of(true), isolateHistory.of("full")],
  });

  assert.equal(transaction.state.doc.toString(), "after");
  assert.equal(transaction.annotation(programmaticEdit), true);
  const afterUndo = runCommand(undo, transaction.state);
  assert.equal(afterUndo.doc.toString(), "before");
  const afterRedo = runCommand(redo, afterUndo);
  assert.equal(afterRedo.doc.toString(), "after");
});
