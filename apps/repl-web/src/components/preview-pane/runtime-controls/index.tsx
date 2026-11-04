import { useId, useState } from "react";
import {
  colorDraftError,
  colorToValidHex,
} from "#/components/uniforms-pane/helpers";
import ColorInput from "#/components/core/color-input";
import Switch from "#/components/core/switch";
import { useFillPreview, usePreviewActions } from "#/stores/preview";
import {
  colorHexToVec3,
  formatColorVec3,
  type RuntimeUniform,
} from "../uniform-controls";
import SizeInput from "../size-input";
import s from "./style.module.css";

interface RuntimeControlsProps {
  uniforms: readonly RuntimeUniform[];
  values: Readonly<Record<string, number | string>>;
  onValueChange: (name: string, value: number | string) => void;
}

export default function RuntimeControls({
  uniforms,
  values,
  onValueChange,
}: RuntimeControlsProps) {
  const sizeLabelId = useId();
  const fillPreviewId = useId();
  const fillPreview = useFillPreview();
  const { setFillPreview } = usePreviewActions();

  return (
    <div className={s.controls} aria-label="Runtime uniform controls">
      <div>
        <div className={s.row}>
          <label className={s.readout} htmlFor={fillPreviewId}>
            <span>Fill preview</span>
          </label>
          <Switch
            id={fillPreviewId}
            checked={fillPreview}
            onSwitch={setFillPreview}
          />
        </div>
        <div className={s.row} role="group" aria-labelledby={sizeLabelId}>
          <div className={s.readout} id={sizeLabelId}>
            <span>Canvas size</span>
          </div>
          <SizeInput disabled={fillPreview} />
        </div>
        {uniforms.map((uniform) => {
          const value = values[uniform.name] ?? uniform.defaultValue;
          return uniform.type === "float" ? (
            <FloatUniformInput
              key={uniform.name}
              value={value}
              uniform={uniform}
              onValueChange={onValueChange}
            />
          ) : (
            <ColorUniformInput
              key={uniform.name}
              value={value}
              uniform={uniform}
              uniformsSnapshot={uniforms}
              onValueChange={onValueChange}
            />
          );
        })}
      </div>
    </div>
  );
}

type FloatUniform = Extract<RuntimeUniform, { type: "float" }>;
interface FloatUniformInputProps {
  value: string | number;
  uniform: FloatUniform;
  onValueChange: (name: string, value: number | string) => void;
}

function FloatUniformInput({
  value,
  uniform,
  onValueChange,
}: FloatUniformInputProps) {
  const currentValue = typeof value === "number" ? value : uniform.defaultValue;
  const id = `runtime-${useId().replaceAll(":", "")}`;

  return (
    <div className={s.row}>
      <div className={s.readout}>
        <label htmlFor={id}>{uniform.name}</label>
        <output>{currentValue.toFixed(2)}</output>
      </div>
      <input
        id={id}
        className={s.range}
        type="range"
        min={uniform.min}
        max={uniform.max}
        step="any"
        value={currentValue}
        aria-label={`Adjust ${uniform.name}`}
        onChange={(event) =>
          onValueChange(uniform.name, Number(event.currentTarget.value))
        }
      />
    </div>
  );
}

type ColorUniform = Extract<RuntimeUniform, { type: "color" }>;
interface ColorUniformInputProps {
  value: string | number;
  uniform: ColorUniform;
  uniformsSnapshot: readonly RuntimeUniform[];
  onValueChange: (name: string, value: number | string) => void;
}

function ColorUniformInput({
  value,
  uniform,
  uniformsSnapshot,
  onValueChange,
}: ColorUniformInputProps) {
  const idPrefix = `runtime-${useId().replaceAll(":", "")}`;
  const currentColor =
    typeof value === "string" && colorHexToVec3(value)
      ? (colorToValidHex(value) ?? uniform.defaultValue)
      : uniform.defaultValue;
  const [draft, setDraft] = useState(currentColor);
  const [previousSnapshot, setPreviousSnapshot] = useState(uniformsSnapshot);

  // A new installed snapshot is the reset boundary. Runtime edits keep the
  // same snapshot identity, so they cannot replace a draft while it is typed.
  if (previousSnapshot !== uniformsSnapshot) {
    setPreviousSnapshot(uniformsSnapshot);
    setDraft(currentColor);
  }

  const error = colorDraftError(draft);

  return (
    <div className={s.row}>
      <div className={s.readout}>
        <span>{uniform.name}</span>
        <output>{formatColorVec3(currentColor, 2)}</output>
      </div>
      <ColorInput
        idPrefix={idPrefix}
        uniformName={uniform.name}
        draft={draft}
        validColor={currentColor}
        error={error}
        onDraftChange={(nextDraft) => {
          setDraft(nextDraft);
          const valid = colorToValidHex(nextDraft);
          if (valid) onValueChange(uniform.name, valid);
        }}
        onColorChange={(color) => {
          setDraft(color);
          onValueChange(uniform.name, color);
        }}
      />
    </div>
  );
}
