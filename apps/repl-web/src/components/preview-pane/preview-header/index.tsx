import { usePlaying, usePreviewActions } from "../../../stores/preview";
import s from "./style.module.css";

function IconPlay() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4.77735 13.4818L12.376 8.41602C12.6728 8.21811 12.6728 7.78188 12.376 7.58397L4.77735 2.51823C4.44507 2.29671 4 2.5349 4 2.93425V13.0657C4 13.4651 4.44507 13.7033 4.77735 13.4818Z"
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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M11 13H13C13.5523 13 14 12.5523 14 12V4C14 3.44772 13.5523 3 13 3H11C10.4477 3 10 3.44772 10 4V12C10 12.5523 10.4477 13 11 13ZM3 13H5C5.55228 13 6 12.5523 6 12V4C6 3.44772 5.55228 3 5 3H3C2.44772 3 2 3.44772 2 4V12C2 12.5523 2.44772 13 3 13Z"
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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M7 4.5C7 5.88071 5.88071 7 4.5 7C3.11929 7 2 5.88071 2 4.5C2 3.11929 3.11929 2 4.5 2C5.88071 2 7 3.11929 7 4.5ZM7 4.5H13.5M9 11.5C9 12.8807 10.1193 14 11.5 14C12.8807 14 14 12.8807 14 11.5C14 10.1193 12.8807 9 11.5 9C10.1193 9 9 10.1193 9 11.5ZM9 11.5H2.5"
        strokeWidth="1.25"
        strokeLinecap="round"
        stroke="currentColor"
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
        <PlaybackIcon /> <span className={s.playbackText}>{label}</span>
      </button>

      <button
        className={s.button}
        onClick={() => toggleDrawer("controls")}
        aria-label="Controls"
      >
        <IconControls /> Controls
      </button>
    </div>
  );
}
