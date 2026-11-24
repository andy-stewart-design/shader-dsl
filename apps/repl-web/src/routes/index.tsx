import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "#/components/app-layout";
import Editor from "#/components/editor-pane";
import SketchLibraryDialog from "#/components/sketch-library-dialog";
import DeleteDialog from "#/components/delete-dialog";
import GuardDialog from "#/components/guard-dialog";
import Preview from "#/components/preview-pane";
import SaveDialog from "#/components/name-dialog";
import { getDraftState } from "#/stores/draft";
import { useSketchLibrary } from "#/hooks/use-sketch-library";
import { useAgentIntegration } from "#/hooks/use-agent-integration";
import { useShdrCompilation } from "#/hooks/use-shdr-compilation";
import { switchPreviewStatus } from "#/preview/switch-preview-status";
import s from "./index.module.css";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const {
    artifact,
    applyState,
    appliedUniforms,
    compileError,
    runtimeError,
    isEvaluationFlashing,
    onPreviewError,
    apply,
    applySketchSwitch,
    applyController,
    applyPortRef,
    capturePortRef,
    getAppliedRevision,
    onInitialFrame,
  } = useShdrCompilation();

  useAgentIntegration({ applyController, capturePortRef });
  const [switchRevision, setSwitchRevision] = useState<number | null>(null);
  const library = useSketchLibrary(() => {
    setSwitchRevision(getDraftState().revision);
    applySketchSwitch();
  });
  const previewStatus = switchPreviewStatus(switchRevision, applyState);

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
      <GuardDialog library={library} />
      <SaveDialog library={library} />
      <DeleteDialog library={library} />

      <section className={s.previewPane}>
        {previewStatus && (
          <p className={s.status} role="status">
            {previewStatus}
          </p>
        )}
        <div className={s.previewContent}>
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
        </div>
      </section>
    </AppLayout>
  );
}
