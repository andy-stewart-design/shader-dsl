import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "#/components/app-layout";
import Editor from "#/components/editor-pane";
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

  return (
    <AppLayout>
      <Editor
        onApply={apply}
        isEvaluationFlashing={isEvaluationFlashing}
        compileError={compileError}
        runtimeError={runtimeError}
      />
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
