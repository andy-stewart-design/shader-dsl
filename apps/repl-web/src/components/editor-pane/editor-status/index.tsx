import "./style.component.css";

export interface EditorStatusProps {
  compileError: string | null;
  runtimeError: string | null;
}

export default function EditorStatus({
  compileError,
  runtimeError,
}: EditorStatusProps) {
  if (!compileError && !runtimeError) return null;

  return (
    <div className="editorPane__status">
      {compileError ? (
        <pre className="editorPane__error" role="alert">
          {compileError}
        </pre>
      ) : null}
      {runtimeError ? (
        <pre className="editorPane__error" role="alert">
          Preview error: {runtimeError}
        </pre>
      ) : null}
    </div>
  );
}
