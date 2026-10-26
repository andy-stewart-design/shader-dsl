import assert from "node:assert/strict";
import test from "node:test";
import { history, redo, undo } from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  Text,
  type Transaction,
} from "@codemirror/state";
import { insertLineAbove } from "./commands.ts";

function createState(
  doc: string | Text,
  ranges: readonly ReturnType<typeof EditorSelection.cursor>[],
  mainIndex = 0,
  withHistory = false,
  readOnly = false,
  lineSeparator?: string,
) {
  return EditorState.create({
    doc,
    selection: EditorSelection.create(ranges, mainIndex),
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      withHistory ? history() : [],
      readOnly ? EditorState.readOnly.of(true) : [],
      lineSeparator ? EditorState.lineSeparator.of(lineSeparator) : [],
    ],
  });
}

function apply(state: EditorState, command = insertLineAbove) {
  let transaction: Transaction | undefined;
  const handled = command({
    state,
    dispatch: (next) => {
      assert.equal(transaction, undefined);
      transaction = next;
    },
  });
  assert.equal(handled, true);
  if (!transaction) throw new Error("command did not dispatch");
  return transaction;
}

test("inserts above first, middle, last, and empty lines", () => {
  const state = createState("first\nmiddle\n", [
    EditorSelection.cursor(0),
    EditorSelection.cursor(7),
    EditorSelection.cursor(13),
  ]);
  const transaction = apply(state);

  assert.equal(transaction.state.doc.toString(), "\nfirst\n\nmiddle\n\n");
  assert.deepEqual(
    transaction.state.selection.ranges.map((range) => range.head),
    [0, 7, 15],
  );
});

test("preserves spaces as indentation", () => {
  const state = createState("value\n  spaces", [EditorSelection.cursor(8)]);
  const transaction = apply(state);

  assert.equal(transaction.state.doc.toString(), "value\n  \n  spaces");
  assert.equal(transaction.state.selection.main.head, 8);
});

test("preserves tabs as indentation", () => {
  const state = createState("value\n\ttabs", [EditorSelection.cursor(7)]);
  const transaction = apply(state);

  assert.equal(transaction.state.doc.toString(), "value\n\t\n\ttabs");
  assert.equal(transaction.state.selection.main.head, 7);
});

test("inserts a line into an empty document", () => {
  const transaction = apply(createState("", [EditorSelection.cursor(0)]));

  assert.equal(transaction.state.doc.toString(), "\n");
  assert.equal(transaction.state.selection.main.head, 0);
  assert.equal(transaction.scrollIntoView, true);
});

test("uses a configured CRLF separator with a normal document", () => {
  const state = createState(
    Text.of(["one", "two"]),
    [EditorSelection.cursor(4)],
    0,
    false,
    false,
    "\r\n",
  );
  const transaction = apply(state);

  assert.equal(transaction.state.doc.toString(), "one\n\ntwo");
  assert.equal(transaction.state.selection.main.head, 4);
});

test("handles multiple cursors on different lines", () => {
  const state = createState("one\ntwo\nthree", [
    EditorSelection.cursor(0),
    EditorSelection.cursor(8),
  ]);
  const transaction = apply(state);

  assert.equal(transaction.state.doc.toString(), "\none\ntwo\n\nthree");
  assert.deepEqual(
    transaction.state.selection.ranges.map((range) => range.head),
    [0, 9],
  );
});

test("deduplicates same-line cursors and preserves the primary cursor", () => {
  const state = createState(
    "one\n  two\nthree",
    [
      EditorSelection.cursor(3),
      EditorSelection.cursor(0),
      EditorSelection.cursor(5),
    ],
    2,
  );
  const transaction = apply(state);

  assert.equal(transaction.state.doc.toString(), "\none\n  \n  two\nthree");
  assert.deepEqual(
    transaction.state.selection.ranges.map((range) => range.head),
    [0, 7],
  );
  assert.equal(transaction.state.selection.main.head, 7);
});

test("is one undoable input operation and supports redo", () => {
  const state = createState("one\ntwo", [EditorSelection.cursor(4)], 0, true);
  const transaction = apply(state);
  assert.equal(transaction.isUserEvent("input"), true);

  let afterUndo: Transaction | undefined;
  assert.equal(
    undo({
      state: transaction.state,
      dispatch: (next) => {
        afterUndo = next;
      },
    }),
    true,
  );
  if (!afterUndo) throw new Error("undo did not dispatch");
  assert.equal(afterUndo.state.doc.toString(), "one\ntwo");

  let afterRedo: Transaction | undefined;
  assert.equal(
    redo({
      state: afterUndo.state,
      dispatch: (next) => {
        afterRedo = next;
      },
    }),
    true,
  );
  if (!afterRedo) throw new Error("redo did not dispatch");
  assert.equal(afterRedo.state.doc.toString(), "one\n\ntwo");
});

test("does not edit a read-only state", () => {
  const state = createState("one", [EditorSelection.cursor(0)], 0, false, true);
  let dispatched = false;

  assert.equal(
    insertLineAbove({
      state,
      dispatch: () => {
        dispatched = true;
      },
    }),
    false,
  );
  assert.equal(dispatched, false);
  assert.equal(state.doc.toString(), "one");
});
