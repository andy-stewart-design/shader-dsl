import { Tabs } from "@base-ui/react/tabs";
import { useDraftActions, useDraftUniforms } from "../../stores/draft";
import UniformsPane from "../uniforms-pane";
import CodeEditor from "./code-editor";
import EditorHeader from "./editor-header";
import EditorStatus from "./editor-status";
import s from "./style.module.css";

export interface EditorProps {
  onApply: () => void;
  isEvaluationFlashing: boolean;
  compileError: string | null;
  runtimeError: string | null;
}

export default function Editor({
  onApply,
  isEvaluationFlashing,
  compileError,
  runtimeError,
}: EditorProps) {
  const uniforms = useDraftUniforms();
  const { setUniforms } = useDraftActions();

  return (
    <Tabs.Root className={s.pane} defaultValue="main">
      <EditorHeader onApply={onApply} />
      <div className={s.panels}>
        <Tabs.Panel className={s.panel} value="main" keepMounted>
          <CodeEditor
            document="main"
            isEvaluationFlashing={isEvaluationFlashing}
          />
        </Tabs.Panel>
        <Tabs.Panel className={s.panel} value="utils" keepMounted>
          <CodeEditor
            document="utils"
            isEvaluationFlashing={isEvaluationFlashing}
          />
        </Tabs.Panel>
        <Tabs.Panel
          className={s.panel}
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
