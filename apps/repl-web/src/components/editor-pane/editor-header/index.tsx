import { Tabs } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import "./style.component.css";

interface EditorHeaderProps {
  onApply: () => void;
}

function RunButton({ onClick }: ComponentProps<"button">) {
  return (
    <button
      className="editorPane__runButton"
      type="button"
      onClick={onClick}
      aria-label="Evaluate"
      aria-keyshortcuts="Alt+Enter"
      title="Apply changes (Option + Return)"
    >
      <span>Run</span>
      <span className="editorPane__shortcut" aria-hidden="true">
        <kbd>⌥</kbd> + <kbd>↵</kbd>
      </span>
    </button>
  );
}

export default function EditorHeader({ onApply }: EditorHeaderProps) {
  return (
    <div className="editorPane__header">
      <Tabs.List className="editorPane__tabList" activateOnFocus>
        <Tabs.Tab className="editorPane__tab" value="main">
          main
        </Tabs.Tab>
        <Tabs.Tab className="editorPane__tab" value="utils">
          utils
        </Tabs.Tab>
        <Tabs.Tab className="editorPane__tab" value="uniforms">
          uniforms
        </Tabs.Tab>
      </Tabs.List>
      <div className="editorPane__actions">
        <RunButton onClick={onApply} />
      </div>
    </div>
  );
}
