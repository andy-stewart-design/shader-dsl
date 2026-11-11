import { isolateHistory, redo, undo } from "@codemirror/commands";
import { Annotation, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorExtensions } from "./extensions.ts";

export const programmaticEdit = Annotation.define<true>();

export interface EditorChange {
  readonly doc: string;
  readonly programmatic: boolean;
}

export interface EditorReplacement {
  readonly current: string;
  apply(): void;
  rollback(): void;
}

export interface CreateEditorOptions {
  parent: Element;
  initialDoc: string;
  ariaLabel?: string;
  onChange?: (change: EditorChange) => void;
}

export interface EditorHandle {
  read(): string;
  replace(next: string): void;
  prepareReplace(next: string): EditorReplacement | null;
  undo(): boolean;
  redo(): boolean;
  isReady(): boolean;
  destroy(): void;
}

/** Creates a browser-only editor. Call destroy when its host is unmounted. */
export function createEditor({
  parent,
  initialDoc,
  ariaLabel = "Code editor",
  onChange,
}: CreateEditorOptions): EditorHandle {
  let disposed = false;
  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      createEditorExtensions(),
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || !onChange) return;
        const programmatic = update.transactions.some(
          (transaction) => transaction.annotation(programmaticEdit) === true,
        );
        onChange({
          doc: update.state.doc.toString(),
          programmatic,
        });
      }),
    ],
  });
  const view = new EditorView({ state, parent });

  function requireReady(): void {
    if (disposed) throw new Error("The editor has been destroyed.");
    if (!view.dom.isConnected) throw new Error("The editor is not mounted.");
  }

  function read(): string {
    requireReady();
    return view.state.doc.toString();
  }

  function prepareReplace(next: string): EditorReplacement | null {
    requireReady();
    const current = view.state.doc.toString();
    if (current === next) return null;
    const baseState = view.state;
    const transaction = baseState.update({
      changes: { from: 0, to: baseState.doc.length, insert: next },
      annotations: [programmaticEdit.of(true), isolateHistory.of("full")],
    });
    let applied = false;
    return {
      current,
      apply() {
        requireReady();
        if (view.state !== baseState) {
          throw new Error("The editor changed while the replacement was staged.");
        }
        applied = true;
        try {
          view.dispatch(transaction);
        } catch (error) {
          view.setState(baseState);
          applied = false;
          throw error;
        }
      },
      rollback() {
        if (!applied) return;
        if (disposed) return;
        view.setState(baseState);
        applied = false;
      },
    };
  }

  return {
    read,
    replace(next) {
      const replacement = prepareReplace(next);
      replacement?.apply();
    },
    prepareReplace,
    undo() {
      requireReady();
      return undo({
        state: view.state,
        dispatch: (transaction) => view.dispatch(transaction),
      });
    },
    redo() {
      requireReady();
      return redo({
        state: view.state,
        dispatch: (transaction) => view.dispatch(transaction),
      });
    },
    isReady() {
      return !disposed && view.dom.isConnected;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      view.destroy();
    },
  };
}
