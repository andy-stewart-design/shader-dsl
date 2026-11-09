import { useEffect, useEffectEvent, useRef } from "react";
import {
  type CreateEditorOptions,
  createEditor,
} from "../editor/create-editor";

export type UseCodeEditorOptions = Pick<
  CreateEditorOptions,
  "initialDoc" | "ariaLabel" | "onChange"
>;

/**
 * Attach the returned ref to a stable div rendered alongside this hook.
 * initialDoc and ariaLabel are initialization-only; CodeMirror owns live edits.
 * onChange always uses the latest committed callback.
 */
export function useCodeEditor(options: UseCodeEditorOptions) {
  const hostRef = useRef<HTMLDivElement>(null);
  const initialOptionsRef = useRef(options);
  const handleChange = useEffectEvent((doc: string) => {
    options.onChange?.(doc);
  });

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

    return () => editor.destroy();
  }, []);

  return hostRef;
}
