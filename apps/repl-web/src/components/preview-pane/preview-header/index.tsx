import { useEffect, useId, useRef } from "react";
import {
  useHeightRatio,
  usePlaying,
  usePreviewActions,
  useWidthRatio,
} from "../../../stores/preview";
import "./style.component.css";

interface RatioInputProps {
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function RatioInput({ name, label, value, onChange }: RatioInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input) input.value = String(value);
  }, [value]);

  return (
    <label className="previewPane__ratioField">
      <span className="previewPane__srOnly">{label}</span>
      <input
        className="previewPane__ratioInput"
        name={name}
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        defaultValue={value}
        ref={inputRef}
        onChange={(event) => {
          const ratio = Number(event.currentTarget.value);
          if (Number.isFinite(ratio) && ratio > 0) onChange(ratio);
        }}
        onBlur={(event) => {
          event.currentTarget.value = String(value);
        }}
      />
    </label>
  );
}

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

export default function PreviewHeader() {
  const playing = usePlaying();
  const widthRatio = useWidthRatio();
  const heightRatio = useHeightRatio();
  const { setDrawerMode, setPlaying, setWidthRatio, setHeightRatio } =
    usePreviewActions();
  const label = playing ? "Pause" : "Play";
  const Icon = playing ? IconPause : IconPlay;
  const sizeLabelId = useId();

  function onControlsClick() {
    setDrawerMode((mode) => (mode === "controls" ? "closed" : "controls"));
  }

  return (
    <div className="previewPane__header">
      <button onClick={onControlsClick}>Controls</button>
      <div
        className="previewPane__ratioControls"
        role="group"
        aria-labelledby={sizeLabelId}
      >
        <span id={sizeLabelId} className="previewPane__ratioGroupLabel">
          Size
        </span>
        <RatioInput
          name="widthRatio"
          label="Width ratio"
          value={widthRatio}
          onChange={setWidthRatio}
        />
        <span className="previewPane__ratioSeparator" aria-hidden="true">
          ×
        </span>
        <RatioInput
          name="heightRatio"
          label="Height ratio"
          value={heightRatio}
          onChange={setHeightRatio}
        />
      </div>
      <div className="previewPane__vr" />
      <button
        className="previewPane__button"
        type="button"
        aria-label={`${label} preview`}
        onClick={() => setPlaying(!playing)}
      >
        <Icon />
      </button>
    </div>
  );
}
