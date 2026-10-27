import s from "./style.module.css";

export interface EditorStatusProps {
  compileError: string | null;
  runtimeError: string | null;
}

export function EditorStatus({
  compileError,
  runtimeError,
}: EditorStatusProps) {
  if (!compileError && !runtimeError) return null;

  return (
    <div className={s.editorStatus}>
      {compileError ? (
        <pre className={s.error} role="alert">
          {compileError}
        </pre>
      ) : null}
      {runtimeError ? (
        <pre className={s.error} role="alert">
          Preview error: {runtimeError}
        </pre>
      ) : null}
    </div>
  );
}
