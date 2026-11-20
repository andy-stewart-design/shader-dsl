import { useEffect, useEffectEvent, useRef } from "react";
import {
  type CreateEditorOptions,
  createEditor,
  type EditorChange,
  type EditorHandle,
} from "../editor/create-editor";

export type UseCodeEditorOptions = Pick<
  CreateEditorOptions,
  "initialDoc" | "ariaLabel"
> & {
  onChange?: (change: EditorChange) => void;
  onReady?: (handle: EditorHandle) => void | (() => void);
};

/**
 * Attach the returned ref to a stable div rendered alongside this hook.
 * initialDoc and ariaLabel are initialization-only; CodeMirror owns live edits.
 * onChange and onReady use the latest committed callbacks.
 */
export function useCodeEditor(options: UseCodeEditorOptions) {
  const hostRef = useRef<HTMLDivElement>(null);
  const initialOptionsRef = useRef(options);
  const handleChange = useEffectEvent((change: EditorChange) => {
    options.onChange?.(change);
  });
  const handleReady = useEffectEvent((handle: EditorHandle) =>
    options.onReady?.(handle),
  );

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;

    const { initialDoc, ariaLabel } = initialOptionsRef.current;
    const editor = createEditor({
      parent,
      initialDoc,
      ariaLabel,
      onChange: handleChange,
    });
    let cleanup: void | (() => void);
    try {
      cleanup = handleReady(editor);
    } catch (error) {
      editor.destroy();
      throw error;
    }

    return () => {
      cleanup?.();
      editor.destroy();
    };
  }, []);

  return hostRef;
}
