import { Tabs } from "@base-ui/react/tabs";
import { Editor } from "../editor";
import Uniforms from "../uniforms-pane";
import type { ComponentProps } from "react";
import {
  useDraftActions,
  useDraftSource,
  useDraftUniforms,
  type DraftDocument,
} from "../../stores/draft";
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

function DraftEditor({
  document,
  ariaLabel,
}: {
  document: DraftDocument;
  ariaLabel: string;
}) {
  const source = useDraftSource(document);
  const { setSource } = useDraftActions();
  return (
    <Editor
      initialDoc={source}
      ariaLabel={ariaLabel}
      onChange={(nextSource) => setSource(document, nextSource)}
    />
  );
}

function DraftUniforms() {
  const uniforms = useDraftUniforms();
  const { setUniforms } = useDraftActions();
  return <Uniforms.Main uniforms={uniforms} onUniformsChange={setUniforms} />;
}

function EditorMain() {
  return (
    <div className={s.panels}>
      <Tabs.Panel className={s.panel} value="main" keepMounted>
        <DraftEditor document="main" ariaLabel="Main shader source" />
      </Tabs.Panel>
      <Tabs.Panel className={s.panel} value="utils" keepMounted>
        <DraftEditor document="utils" ariaLabel="Utils shader source" />
      </Tabs.Panel>
      <Tabs.Panel className={s.panel} value="uniforms" keepMounted>
        <DraftUniforms />
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
