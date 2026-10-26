import { useCodeEditor } from "../../hooks/use-code-editor";
import { initialShaderSource } from "../../shared/initial-source";
import s from "./style.module.css";

export interface EditorProps {
  initialDoc?: string;
  onChange?: (doc: string) => void;
  ariaLabel?: string;
}

export function Editor({
  initialDoc = initialShaderSource,
  onChange,
  ariaLabel = "Shader source",
}: EditorProps) {
  const editorRef = useCodeEditor({ initialDoc, onChange, ariaLabel });

  return <div className={s.editor} ref={editorRef} />;
}
