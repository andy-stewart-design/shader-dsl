import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "#/components/app-layout";
import { AppPane } from "#/components/app-pane";
import Editor from "#/components/editor-pane";
import Preview from "#/components/preview-pane";
import { useShdrCompilation } from "#/hooks/use-shdr-compilation";
import type { Uniform } from "#/components/uniforms-pane/types";
import { toRuntimeUniforms } from "#/components/preview-pane/uniform-controls";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [playing, setPlaying] = useState(true);
  const [widthRatio, setWidthRatio] = useState(1);
  const [heightRatio, setHeightRatio] = useState(1);
  const [uniforms, setUniforms] = useState<Uniform[]>([]);
  const {
    artifact,
    appliedUniforms,
    compileError,
    runtimeError,
    onChange,
    onPreviewError,
    apply,
  } = useShdrCompilation(uniforms);

  const runtimeUniforms = useMemo(
    () => toRuntimeUniforms(appliedUniforms),
    [appliedUniforms],
  );

  return (
    <AppLayout>
      <AppPane as="tabs" background="secondary">
        <Editor.Header onEval={apply} />
        <Editor.Main
          onChange={onChange}
          uniforms={uniforms}
          onUniformsChange={setUniforms}
        />
        <Editor.Status
          compileError={compileError}
          runtimeError={runtimeError}
        />
      </AppPane>
      {artifact && (
        <Preview.Pane>
          <Preview.Main
            artifact={artifact}
            runtimeUniforms={runtimeUniforms}
            playing={playing}
            onError={onPreviewError}
            widthRatio={widthRatio}
            heightRatio={heightRatio}
          />
          <Preview.Header
            playing={playing}
            onPlayingChange={setPlaying}
            widthRatio={widthRatio}
            onWidthRatioChange={setWidthRatio}
            heightRatio={heightRatio}
            onHeightRatioChange={setHeightRatio}
          />
        </Preview.Pane>
      )}
    </AppLayout>
  );
}
