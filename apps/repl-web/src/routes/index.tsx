import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/app-layout";
import { Editor } from "../components/editor";
import { EditorStatus } from "../components/editor-status";
import { PreviewCanvas } from "../components/preview-canvas";
import { useShdrCompilation } from "../hooks/use-shdr-compilation";
import { initialShaderSource } from "../shared/initial-source";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const {
    artifact,
    compileError,
    runtimeError,
    onChange,
    onPreviewError,
    apply,
  } = useShdrCompilation();

  return (
    <AppLayout
      editor={
        <>
          <Editor initialDoc={initialShaderSource} onChange={onChange} />
          <EditorStatus
            compileError={compileError}
            runtimeError={runtimeError}
            onApply={apply}
          />
        </>
      }
      preview={
        artifact ? (
          <PreviewCanvas artifact={artifact} onError={onPreviewError} />
        ) : null
      }
    />
  );
}
