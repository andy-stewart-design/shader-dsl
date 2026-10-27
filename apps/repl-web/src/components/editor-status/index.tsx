import s from "./style.module.css";

export interface EditorStatusProps {
  compileError: string | null;
  runtimeError: string | null;
  onApply: () => void;
}

export function EditorStatus({
  compileError,
  runtimeError,
  onApply,
}: EditorStatusProps) {
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
      <div className={s.controls}>
        <button type="button" onClick={onApply} aria-keyshortcuts="Alt+Enter">
          Apply
        </button>
        <span>Option + Return</span>
      </div>
    </div>
  );
}
