import { usePlaying, usePreviewActions } from "../../../stores/preview";
import s from "./style.module.css";

function IconPlay() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 2L16 10L4 18V2Z"
        fill="none"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 3H8V17H4V3ZM12 3H16V17H12V3Z"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </svg>
  );
}

function IconControls() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M11 5H17M3 15L9 15M8 5C8 6.65685 6.65685 8 5 8C3.34315 8 2 6.65685 2 5C2 3.34315 3.34315 2 5 2C6.65685 2 8 3.34315 8 5ZM18 15C18 16.6569 16.6569 18 15 18C13.3431 18 12 16.6569 12 15C12 13.3431 13.3431 12 15 12C16.6569 12 18 13.3431 18 15Z"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="white"
      />
    </svg>
  );
}

export default function PreviewHeader() {
  const playing = usePlaying();
  const { toggleDrawer, setPlaying } = usePreviewActions();
  const label = playing ? "Pause" : "Play";
  const PlaybackIcon = playing ? IconPause : IconPlay;

  return (
    <div className={s.header}>
      <button
        className={s.button}
        type="button"
        aria-label={`${label} preview`}
        onClick={() => setPlaying(!playing)}
      >
        <PlaybackIcon />
      </button>

      <button
        className={s.button}
        onClick={() => toggleDrawer("controls")}
        aria-label="Controls"
      >
        <IconControls />
      </button>
    </div>
  );
}
