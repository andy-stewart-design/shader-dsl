import { useMemo, type CSSProperties } from "react";
import type { CompiledFragmentArtifact } from "shdr";
import { useShdrPreview } from "#/hooks/use-shdr-preview";
import type { Uniform } from "../../shared/uniforms";
import {
  useDrawerMode,
  useFillPreview,
  useHeightRatio,
  usePlaying,
  useWidthRatio,
} from "../../stores/preview";
import { toRuntimeUniforms } from "./uniform-controls";
import PreviewHeader from "./preview-header";
import RuntimeControls from "./runtime-controls";
import s from "./style.module.css";

interface PreviewProps {
  artifact: CompiledFragmentArtifact;
  appliedUniforms: readonly Uniform[];
  onError: (error: unknown) => void;
}

export default function Preview({
  artifact,
  appliedUniforms,
  onError,
}: PreviewProps) {
  const playing = usePlaying();
  const runtimeUniforms = useMemo(
    () => toRuntimeUniforms(appliedUniforms),
    [appliedUniforms],
  );
  const {
    hostRef,
    runtimeUniforms: installedUniforms,
    runtimeValues,
    onRuntimeValueChange,
  } = useShdrPreview({ artifact, runtimeUniforms, playing, onError });

  const mode = useDrawerMode();
  const fillPreview = useFillPreview();

  const widthRatio = useWidthRatio();
  const heightRatio = useHeightRatio();
  const canvasStyle = {
    "--preview-aspect-ratio": widthRatio / heightRatio,
  } as CSSProperties;

  return (
    <div
      className={s.pane}
      data-drawer-mode={mode}
      data-fill-preview={fillPreview}
    >
      <div className={s.main}>
        <div className={s.canvas} ref={hostRef} style={canvasStyle} />
      </div>
      <RuntimeControls
        uniforms={installedUniforms}
        values={runtimeValues}
        onValueChange={onRuntimeValueChange}
      />
      <PreviewHeader />
    </div>
  );
}
