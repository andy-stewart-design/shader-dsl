import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/app-layout";
import { ApplyButton } from "../components/apply-button";
import { EditorTabs } from "../components/editor-tabs";
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
          <EditorTabs
            initialMain={initialShaderSource}
            initialUtils=""
            onChange={onChange}
            actions={<ApplyButton onClick={apply} />}
          />
          <EditorStatus
            compileError={compileError}
            runtimeError={runtimeError}
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
