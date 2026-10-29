import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/app-layout";
import { AppPane, EditorHeader, EditorMain } from "../components/editor-tabs";
import { EditorStatus } from "../components/editor-status";
import { PreviewCanvas } from "../components/preview-canvas";
import { PreviewControls } from "../components/preview-controls";
import { useShdrCompilation } from "../hooks/use-shdr-compilation";
import { initialShaderSource } from "../shared/initial-source";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [playing, setPlaying] = useState(true);
  const {
    artifact,
    compileError,
    runtimeError,
    onChange,
    onPreviewError,
    apply,
  } = useShdrCompilation();

  return (
    <AppLayout>
      <AppPane as="tabs">
        <EditorHeader onEval={apply} />
        <EditorMain
          initialMain={initialShaderSource}
          initialUtils=""
          onChange={onChange}
        />
        <EditorStatus compileError={compileError} runtimeError={runtimeError} />
      </AppPane>
      <AppPane>
        {artifact && (
          <>
            <PreviewControls playing={playing} onPlayingChange={setPlaying} />
            <PreviewCanvas
              artifact={artifact}
              playing={playing}
              onError={onPreviewError}
            />
          </>
        )}
      </AppPane>
    </AppLayout>
  );
}
