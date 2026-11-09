import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "#/components/app-layout";
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
  } = useShdrCompilation();

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
        />
      )}
    </AppLayout>
  );
}
