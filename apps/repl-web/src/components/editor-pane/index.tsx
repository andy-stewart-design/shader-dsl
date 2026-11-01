import { Tabs } from "@base-ui/react/tabs";
import { useDraftActions, useDraftUniforms } from "../../stores/draft";
import { UniformsPane } from "../uniforms-pane";
import CodeEditor from "./code-editor";
import EditorHeader from "./editor-header";
import EditorStatus from "./editor-status";
import "./style.component.css";

export interface EditorProps {
  onApply: () => void;
  compileError: string | null;
  runtimeError: string | null;
}

export default function Editor({
  onApply,
  compileError,
  runtimeError,
}: EditorProps) {
  const uniforms = useDraftUniforms();
  const { setUniforms } = useDraftActions();

  return (
    <Tabs.Root className="editorPane" defaultValue="main">
      <EditorHeader onApply={onApply} />
      <div className="editorPane__panels">
        <Tabs.Panel className="editorPane__panel" value="main" keepMounted>
          <CodeEditor document="main" />
        </Tabs.Panel>
        <Tabs.Panel className="editorPane__panel" value="utils" keepMounted>
          <CodeEditor document="utils" />
        </Tabs.Panel>
        <Tabs.Panel
          className="editorPane__panel"
          value="uniforms"
          keepMounted
        >
          <UniformsPane
            uniforms={uniforms}
            onUniformsChange={setUniforms}
          />
        </Tabs.Panel>
      </div>
      <EditorStatus
        compileError={compileError}
        runtimeError={runtimeError}
      />
    </Tabs.Root>
  );
}
