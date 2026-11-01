import { Tabs } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import s from "./style.module.css";

interface EditorHeaderProps {
  onApply: () => void;
}

function RunButton({ onClick }: ComponentProps<"button">) {
  return (
    <button
      className={s.runButton}
      type="button"
      onClick={onClick}
      aria-label="Evaluate"
      aria-keyshortcuts="Alt+Enter"
      title="Apply changes (Option + Return)"
    >
      <span>Run</span>
      <span className={s.shortcut} aria-hidden="true">
        <kbd>⌥</kbd> + <kbd>↵</kbd>
      </span>
    </button>
  );
}

export default function EditorHeader({ onApply }: EditorHeaderProps) {
  return (
    <div className={s.header}>
      <Tabs.List className={s.tabList} activateOnFocus>
        <Tabs.Tab className={s.tab} value="main">
          main
        </Tabs.Tab>
        <Tabs.Tab className={s.tab} value="utils">
          utils
        </Tabs.Tab>
        <Tabs.Tab className={s.tab} value="uniforms">
          uniforms
        </Tabs.Tab>
      </Tabs.List>
      <div className={s.actions}>
        <RunButton onClick={onApply} />
      </div>
    </div>
  );
}
