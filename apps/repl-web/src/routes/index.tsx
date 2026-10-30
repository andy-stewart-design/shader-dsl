import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "#/components/app-layout";
import { AppPane } from "#/components/app-pane";
import Editor from "#/components/editor-pane";
import Preview from "#/components/preview-pane";
import { useShdrCompilation } from "#/hooks/use-shdr-compilation";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [playing, setPlaying] = useState(true);
  const [widthRatio, setWidthRatio] = useState(1);
  const [heightRatio, setHeightRatio] = useState(1);
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
            <Preview.Header
              playing={playing}
              onPlayingChange={setPlaying}
              widthRatio={widthRatio}
              onWidthRatioChange={setWidthRatio}
              heightRatio={heightRatio}
              onHeightRatioChange={setHeightRatio}
            />
            <Preview.Main
              artifact={artifact}
              playing={playing}
              onError={onPreviewError}
              widthRatio={widthRatio}
              heightRatio={heightRatio}
            />
          </>
        )}
      </AppPane>
    </AppLayout>
  );
}
