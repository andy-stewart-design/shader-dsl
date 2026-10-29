import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "#/components/app-layout";
import { AppPane } from "#/components/app-pane";
import Editor from "#/components/editor-pane";
import { PreviewCanvas } from "#/components/preview-canvas";
import { PreviewControls } from "#/components/preview-controls";
import { useShdrCompilation } from "#/hooks/use-shdr-compilation";

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
      <AppPane as="tabs" background="secondary">
        <Editor.Header onEval={apply} />
        <Editor.Main onChange={onChange} />
        <Editor.Status
          compileError={compileError}
          runtimeError={runtimeError}
        />
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
