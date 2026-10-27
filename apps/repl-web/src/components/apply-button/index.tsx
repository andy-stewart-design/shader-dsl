import s from "./style.module.css";

export interface ApplyButtonProps {
  onClick: () => void;
}

export function ApplyButton({ onClick }: ApplyButtonProps) {
  return (
    <button
      className={s.button}
      type="button"
      onClick={onClick}
      aria-label="Evaluate"
      aria-keyshortcuts="Alt+Enter"
      title="Apply changes (Option + Return)"
    >
      <span>Eval</span>
      <span className={s.shortcut} aria-hidden="true">
        <kbd>⌥</kbd> + <kbd>↵</kbd>
      </span>
    </button>
  );
}
