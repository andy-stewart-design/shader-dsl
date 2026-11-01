import { useCodeEditor } from "../../../hooks/use-code-editor";
import {
  useDraftActions,
  useDraftSource,
  type DraftDocument,
} from "../../../stores/draft";
import s from "./style.module.css";

export interface CodeEditorProps {
  document: DraftDocument;
  ariaLabel?: string;
}

export default function CodeEditor({
  document,
  ariaLabel,
}: CodeEditorProps) {
  const source = useDraftSource(document);
  const { setSource } = useDraftActions();
  const editorRef = useCodeEditor({
    initialDoc: source,
    ariaLabel:
      ariaLabel ??
      (document === "main" ? "Main shader source" : "Utils shader source"),
    onChange: (nextSource) => setSource(document, nextSource),
  });

  return <div className={s.codeEditor} ref={editorRef} />;
}
