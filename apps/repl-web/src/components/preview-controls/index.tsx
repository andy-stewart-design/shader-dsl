import s from "./style.module.css";

export interface PreviewControlsProps {
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
}

export function PreviewControls({
  playing,
  onPlayingChange,
}: PreviewControlsProps) {
  const label = playing ? "Pause" : "Play";

  return (
    <div className={s.controls}>
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
