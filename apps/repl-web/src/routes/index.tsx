import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "#/components/app-layout";
import Editor from "#/components/editor-pane";
import SketchLibraryDialog from "#/components/sketch-library-dialog";
import { useSketchLibrary } from "#/hooks/use-sketch-library";
import Preview from "#/components/preview-pane";
import { useAgentIntegration } from "#/hooks/use-agent-integration";
import { useShdrCompilation } from "#/hooks/use-shdr-compilation";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const {
    artifact,
    appliedUniforms,
    compileError,
    runtimeError,
    isEvaluationFlashing,
    onPreviewError,
    apply,
    applyController,
    applyPortRef,
    capturePortRef,
    getAppliedRevision,
    onInitialFrame,
  } = useShdrCompilation();

  useAgentIntegration({ applyController, capturePortRef });
  const library = useSketchLibrary();

  return (
    <AppLayout>
      <Editor
        onApply={apply}
        onSave={library.save}
        onSaveCopy={library.saveCopy}
        onLibrary={library.showList}
        saving={library.saving}
        isEvaluationFlashing={isEvaluationFlashing}
        compileError={compileError}
        runtimeError={runtimeError}
      />
      <SketchLibraryDialog library={library} />
      {artifact && (
        <Preview
          artifact={artifact}
          appliedUniforms={appliedUniforms}
          onError={onPreviewError}
          applyPortRef={applyPortRef}
          capturePortRef={capturePortRef}
          getAppliedRevision={getAppliedRevision}
          onInitialFrame={onInitialFrame}
        />
      )}
    </AppLayout>
  );
}
