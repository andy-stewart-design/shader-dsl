import { Tabs } from "@base-ui/react/tabs";
import { Editor } from "../editor";
import Uniforms from "../uniforms-pane";
import { initialShaderSource } from "../../shared/initial-source";
import type { ComponentProps } from "react";
import type { ShaderDocument } from "../../compiler/compile-shdr-body";
import type { Uniform } from "../uniforms-pane/types";
import s from "./style.module.css";

interface EditorHeaderProps {
  onEval: () => void;
}

function EditorHeader({ onEval }: EditorHeaderProps) {
  return (
    <div className={s.header}>
      <Tabs.List className={s.list} activateOnFocus>
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
        <EvalButton onClick={onEval} />
      </div>
    </div>
  );
}

export function EvalButton({ onClick }: ComponentProps<"button">) {
  return (
    <button
      className={s.button}
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

interface EditorMainProps {
  onChange: (document: ShaderDocument, source: string) => void;
  uniforms: Uniform[];
  onUniformsChange: (uniforms: Uniform[]) => void;
}

function EditorMain({ onChange, uniforms, onUniformsChange }: EditorMainProps) {
  return (
    <div className={s.panels}>
      <Tabs.Panel className={s.panel} value="main" keepMounted>
        <Editor
          initialDoc={initialShaderSource}
          ariaLabel="Main shader source"
          onChange={(source) => onChange("main", source)}
        />
      </Tabs.Panel>
      <Tabs.Panel className={s.panel} value="utils" keepMounted>
        <Editor
          initialDoc={""}
          ariaLabel="Utils shader source"
          onChange={(source) => onChange("utils", source)}
        />
      </Tabs.Panel>
      <Tabs.Panel className={s.panel} value="uniforms" keepMounted>
        <Uniforms.Main
          uniforms={uniforms}
          onUniformsChange={onUniformsChange}
        />
      </Tabs.Panel>
    </div>
  );
}

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

const Parent = {
  Main: EditorMain,
  Header: EditorHeader,
  Status: EditorStatus,
};

export default Parent;
