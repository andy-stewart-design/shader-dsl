import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorExtensions } from "./extensions";

export interface CreateEditorOptions {
  parent: Element;
  initialDoc: string;
  ariaLabel?: string;
  onChange?: (doc: string) => void;
}

export interface EditorHandle {
  destroy(): void;
}

/** Creates a browser-only editor. Call destroy when its host is unmounted. */
export function createEditor({
  parent,
  initialDoc,
  ariaLabel = "Code editor",
  onChange,
}: CreateEditorOptions): EditorHandle {
  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      createEditorExtensions(),
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChange) {
          onChange(update.state.doc.toString());
        }
      }),
    ],
  });
  const view = new EditorView({ state, parent });

  return {
    destroy() {
      view.destroy();
    },
  };
}
