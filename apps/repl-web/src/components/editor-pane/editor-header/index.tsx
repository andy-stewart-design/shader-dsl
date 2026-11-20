import { Tabs } from "@base-ui/react/tabs";
import { Fragment, type ComponentProps } from "react";
import s from "./style.module.css";

interface EditorHeaderProps {
  onApply: () => void;
  onSave: () => void;
  onSaveCopy: () => void;
  onLibrary: () => void;
  saving: boolean;
}

export default function EditorHeader({ onApply, onSave, onSaveCopy, onLibrary, saving }: EditorHeaderProps) {
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
        <HeaderButton label="Save" onClick={onSave} disabled={saving} />
        <HeaderButton label="Save as copy" onClick={onSaveCopy} disabled={saving} />
        <HeaderButton label="Library" onClick={onLibrary} />
      </div>
    </div>
  );
}

interface HeaderButtonProps extends ComponentProps<"button"> {
  label: string;
  shorcutKeys?: string[];
}

function HeaderButton({ label, shorcutKeys, ...props }: HeaderButtonProps) {
  return (
    <button
      className={s.action}
      type="button"
      {...props}
      aria-keyshortcuts={label === "Run" ? "Alt+Enter" : undefined}
      title={label === "Run" ? "Run (Option + Return)" : undefined}
    >
      <span>{label}</span>
      {shorcutKeys && (
        <span className={s.shortcut} aria-hidden="true">
          {shorcutKeys.map((key, i) => (
            <Fragment key={key}>
              <kbd>{key}</kbd>
              {i < shorcutKeys.length - 1 && " + "}
            </Fragment>
          ))}
        </span>
      )}
    </button>
  );
}
