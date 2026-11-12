import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "#/components/app-layout";
import AgentConnection from "#/components/agent-connection";
import { AgentProvider } from "#/agent/provider";
import Editor from "#/components/editor-pane";
import Preview from "#/components/preview-pane";
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
    onInitialFrame,
  } = useShdrCompilation();

  return (
    <AgentProvider applyController={applyController}>
      <AgentConnection />
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
            onInitialFrame={onInitialFrame}
          />
        )}
      </AppLayout>
    </AgentProvider>
  );
}
