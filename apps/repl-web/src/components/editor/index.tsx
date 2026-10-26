import { useCodeEditor } from "../../hooks/use-code-editor";
import s from "./style.module.css";

const defaultInitialDoc = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const color = vec4(uv.x, uv.y, 0, 1);

  return color;
});`;

export interface EditorProps {
  initialDoc?: string;
  onChange?: (doc: string) => void;
  ariaLabel?: string;
}

export function Editor({
  initialDoc = defaultInitialDoc,
  onChange,
  ariaLabel = "Shader source",
}: EditorProps) {
  const editorRef = useCodeEditor({ initialDoc, onChange, ariaLabel });

  return <div className={s.editor} ref={editorRef} />;
}
