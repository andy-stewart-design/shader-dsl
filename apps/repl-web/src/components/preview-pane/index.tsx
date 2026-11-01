import {
  useId,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  useShdrPreview,
  type UseShdrPreviewOptions,
} from "#/hooks/use-shdr-preview";
import s from "./style.module.css";
import { useDrawerMode, usePreviewActions } from "./state";
import { RuntimeControls } from "./runtime-controls";

export interface PreviewHeaderProps {
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  widthRatio: number;
  onWidthRatioChange: (ratio: number) => void;
  heightRatio: number;
  onHeightRatioChange: (ratio: number) => void;
}

interface RatioInputProps {
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function RatioInput({ name, label, value, onChange }: RatioInputProps) {
  return (
    <label className={s.ratioField}>
      <span className={s.srOnly}>{label}</span>
      <input
        className={s.ratioInput}
        name={name}
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        defaultValue={value}
        onChange={(event) => {
          const ratio = Number(event.currentTarget.value);
          if (Number.isFinite(ratio) && ratio > 0) onChange(ratio);
        }}
        onBlur={(event) => {
          const ratio = Number(event.currentTarget.value);
          if (!Number.isFinite(ratio) || ratio <= 0)
            event.currentTarget.value = String(value);
        }}
      />
    </label>
  );
}

export function PreviewHeader({
  playing,
  onPlayingChange,
  widthRatio,
  onWidthRatioChange,
  heightRatio,
  onHeightRatioChange,
}: PreviewHeaderProps) {
  const label = playing ? "Pause" : "Play";
  const Icon = playing ? IconPause : IconPlay;
  const sizeLabelId = useId();
  const { setDrawerMode } = usePreviewActions();

  function onControlsClick() {
    setDrawerMode((mode) => (mode === "controls" ? "closed" : "controls"));
  }

  return (
    <div className={s.header}>
      <button onClick={onControlsClick}>Controls</button>
      <div
        className={s.ratioControls}
        role="group"
        aria-labelledby={sizeLabelId}
      >
        <span id={sizeLabelId} className={s.ratioGroupLabel}>
          Size
        </span>
        <RatioInput
          name="widthRatio"
          label="Width ratio"
          value={widthRatio}
          onChange={onWidthRatioChange}
        />
        <span className={s.ratioSeparator} aria-hidden="true">
          ×
        </span>
        <RatioInput
          name="heightRatio"
          label="Height ratio"
          value={heightRatio}
          onChange={onHeightRatioChange}
        />
      </div>
      <div className={s.vr}></div>
      <button
        className={s.button}
        type="button"
        aria-label={`${label} preview`}
        onClick={() => onPlayingChange(!playing)}
      >
        <Icon />
      </button>
    </div>
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
        stroke-linejoin="round"
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

export interface PreviewMainProps extends UseShdrPreviewOptions {
  widthRatio: number;
  heightRatio: number;
}

interface PreviewCanvasSurfaceProps {
  previewRef: RefObject<HTMLDivElement | null>;
  widthRatio: number;
  heightRatio: number;
}


export function PreviewMain({
  widthRatio,
  heightRatio,
  ...props
}: PreviewMainProps) {
  const {
    hostRef,
    runtimeUniforms,
    runtimeValues,
    onRuntimeValueChange,
  } = useShdrPreview(props);

  return (
    <>
      <div className={s.main}>
        <PreviewCanvasSurface
          previewRef={hostRef}
          widthRatio={widthRatio}
          heightRatio={heightRatio}
        />
      </div>
      <RuntimeControls
        uniforms={runtimeUniforms}
        values={runtimeValues}
        onValueChange={onRuntimeValueChange}
      />
    </>
  );
}

export interface PreviewCanvasProps extends UseShdrPreviewOptions {
  widthRatio: number;
  heightRatio: number;
}

function PreviewCanvasSurface({
  previewRef,
  widthRatio,
  heightRatio,
}: PreviewCanvasSurfaceProps) {
  return (
    <div
      className={s.root}
      ref={previewRef}
      style={
        {
          aspectRatio: `${widthRatio} / ${heightRatio}`,
          "--preview-aspect-ratio": widthRatio / heightRatio,
        } as CSSProperties
      }
    />
  );
}

export function PreviewCanvas({
  widthRatio,
  heightRatio,
  ...props
}: PreviewCanvasProps) {
  const { hostRef } = useShdrPreview(props);
  return (
    <PreviewCanvasSurface
      previewRef={hostRef}
      widthRatio={widthRatio}
      heightRatio={heightRatio}
    />
  );
}

function PreviewPane({ children }: { children: ReactNode }) {
  const mode = useDrawerMode();

  return (
    <div className={s.pane} data-drawer-mode={mode}>
      {children}
    </div>
  );
}

const Parent = { Pane: PreviewPane, Header: PreviewHeader, Main: PreviewMain };
export default Parent;
