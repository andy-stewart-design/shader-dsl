import {
  useShdrPreview,
  type UseShdrPreviewOptions,
} from "#/hooks/use-shdr-preview";
import s from "./style.module.css";

export interface PreviewHeaderProps {
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
}

export function PreviewHeader({
  playing,
  onPlayingChange,
}: PreviewHeaderProps) {
  const label = playing ? "Pause" : "Play";

  return (
    <div className={s.header}>
      <button
        className={s.button}
        type="button"
        aria-label={`${label} preview`}
        onClick={() => onPlayingChange(!playing)}
      >
        {label}
      </button>
    </div>
  );
}

export type PreviewMainProps = UseShdrPreviewOptions;

export function PreviewMain(props: PreviewMainProps) {
  return (
    <div className={s.main}>
      <PreviewCanvas {...props} />
    </div>
  );
}

export type PreviewCanvasProps = UseShdrPreviewOptions;

export function PreviewCanvas(props: PreviewCanvasProps) {
  const previewRef = useShdrPreview(props);

  return <div className={s.root} ref={previewRef} />;
}

const Parent = { Header: PreviewHeader, Main: PreviewMain };
export default Parent;
