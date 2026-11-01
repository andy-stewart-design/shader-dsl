import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "#/components/app-layout";
import { AppPane } from "#/components/app-pane";
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
    onPreviewError,
    apply,
  } = useShdrCompilation();

  return (
    <AppLayout>
      <AppPane as="tabs" background="secondary">
        <Editor.Header onEval={apply} />
        <Editor.Main />
        <Editor.Status
          compileError={compileError}
          runtimeError={runtimeError}
        />
      </AppPane>
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
