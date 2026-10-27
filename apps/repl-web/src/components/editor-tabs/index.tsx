import type { ReactNode } from "react";
import type { ShaderDocument } from "../../compiler/compile-shdr-body";
import { initialShaderSource } from "../../shared/initial-source";
import { Tabs } from "@base-ui/react/tabs";
import { Editor } from "../editor";
import s from "./style.module.css";

export interface EditorTabsProps {
  initialMain?: string;
  initialUtils?: string;
  onChange: (document: ShaderDocument, source: string) => void;
  actions?: ReactNode;
}

export function EditorTabs({
  initialMain = initialShaderSource,
  initialUtils = "",
  onChange,
  actions,
}: EditorTabsProps) {
  return (
    <Tabs.Root className={s.root} defaultValue="main">
      <div className={s.header}>
        <Tabs.List className={s.list} activateOnFocus>
          <Tabs.Tab className={s.tab} value="main">
            main
          </Tabs.Tab>
          <Tabs.Tab className={s.tab} value="utils">
            utils
          </Tabs.Tab>
        </Tabs.List>
        {actions != null ? <div className={s.actions}>{actions}</div> : null}
      </div>
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
    </Tabs.Root>
  );
}
