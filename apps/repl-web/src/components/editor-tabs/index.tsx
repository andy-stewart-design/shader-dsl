import { Tabs } from "@base-ui/react/tabs";
import { ApplyButton } from "../apply-button";
import { Editor } from "../editor";
import { initialShaderSource } from "../../shared/initial-source";
import type { ReactNode } from "react";
import type { ShaderDocument } from "../../compiler/compile-shdr-body";
import s from "./style.module.css";

interface EditorHeaderProps {
  onEval: () => void;
}

interface EditorMainProps {
  initialMain?: string;
  initialUtils?: string;
  onChange: (document: ShaderDocument, source: string) => void;
}

interface AppPaneProps {
  as?: "tabs" | "div";
  children: ReactNode;
}

export function AppPane({ as = "div", children }: AppPaneProps) {
  if (as === "tabs") {
    return (
      <Tabs.Root className={s.root} defaultValue="main">
        {children}
      </Tabs.Root>
    );
  }
  return <div className={s.root}>{children}</div>;
}

export function EditorHeader({ onEval }: EditorHeaderProps) {
  return (
    <div className={s.header}>
      <Tabs.List className={s.list} activateOnFocus>
        <Tabs.Tab className={s.tab} value="main">
          main
        </Tabs.Tab>
        <Tabs.Tab className={s.tab} value="utils">
          utils
        </Tabs.Tab>
      </Tabs.List>
      <div className={s.actions}>
        <ApplyButton onClick={onEval} />
      </div>
    </div>
  );
}

export function EditorMain({
  initialMain,
  initialUtils,
  onChange,
}: EditorMainProps) {
  return (
    <div className={s.panels}>
      <Tabs.Panel className={s.panel} value="main" keepMounted>
        <Editor
          initialDoc={initialMain}
          ariaLabel="Main shader source"
          onChange={(source) => onChange("main", source)}
        />
      </Tabs.Panel>
      <Tabs.Panel className={s.panel} value="utils" keepMounted>
        <Editor
          initialDoc={initialUtils}
          ariaLabel="Utils shader source"
          onChange={(source) => onChange("utils", source)}
        />
      </Tabs.Panel>
    </div>
  );
}
