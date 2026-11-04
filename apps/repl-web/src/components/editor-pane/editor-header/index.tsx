import { Tabs } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import s from "./style.module.css";

interface EditorHeaderProps {
  onApply: () => void;
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
        <HeaderButton label="Run" shorcutKeys={["⌥", "↵"]} onClick={onApply} />
        <HeaderButton label="Save" shorcutKeys={["⌥", "S"]} />
      </div>
    </div>
  );
}

interface HeaderButtonProps extends ComponentProps<"button"> {
  label: string;
  shorcutKeys?: string[];
}

function HeaderButton({ label, shorcutKeys, onClick }: HeaderButtonProps) {
  return (
    <button
      className={s.runButton}
      type="button"
      onClick={onClick}
      aria-label="Evaluate"
      aria-keyshortcuts="Alt+Enter"
      title="Apply changes (Option + Return)"
    >
      <span>{label}</span>
      {shorcutKeys && (
        <span className={s.shortcut} aria-hidden="true">
          {shorcutKeys.map((key, i) => (
            <>
              <kbd>{key}</kbd>
              {i < shorcutKeys.length - 1 && " + "}
            </>
          ))}
        </span>
      )}
    </button>
  );
}
