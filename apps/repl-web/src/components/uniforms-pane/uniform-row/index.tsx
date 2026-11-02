import { useId, type ReactNode } from "react";
import {
  changeUniformType,
  colorDraftError,
  colorToValidHex,
  nameError,
  numberDraftError,
  parseF32,
} from "../helpers";
import ColorField from "../color-field";
import FloatFields from "../float-fields";
import TypeSelect from "../type-select";
import type { Uniform, UniformType } from "../../../shared/uniforms";
import s from "./style.module.css";

interface UniformRowProps {
  uniform: Uniform;
  duplicateName: boolean;
  onChange: (uniform: Uniform) => void;
  onRemove: () => void;
}

export default function UniformRow({
  uniform,
  duplicateName,
  onChange,
  onRemove,
}: UniformRowProps) {
  const idPrefix = `uniform-${useId().replaceAll(":", "")}`;
  const uniformNameError = nameError(uniform.name, duplicateName);
  let typeFields: ReactNode;

  if (uniform.type === "float") {
    const valueError = numberDraftError(uniform.value, "Value");
    const minError = numberDraftError(uniform.min, "Min");
    const maxError = numberDraftError(uniform.max, "Max");
    const valueNumber = parseF32(uniform.value);
    const minNumber = parseF32(uniform.min);
    const maxNumber = parseF32(uniform.max);
    const hasValidRange = minNumber !== undefined && maxNumber !== undefined;
    const rangeError =
      hasValidRange && minNumber >= maxNumber
        ? "Min must be less than max."
        : null;
    const outOfRangeError =
      valueNumber !== undefined &&
      !rangeError &&
      hasValidRange &&
      (valueNumber < minNumber || valueNumber > maxNumber)
        ? "Value is outside the selected range."
        : null;

    typeFields = (
      <FloatFields
        idPrefix={idPrefix}
        value={uniform.value}
        min={uniform.min}
        max={uniform.max}
        valueError={outOfRangeError ?? valueError}
        minError={minError}
        maxError={maxError}
        rangeError={rangeError}
        onValueChange={(value) => onChange({ ...uniform, value })}
        onMinChange={(min) => onChange({ ...uniform, min })}
        onMaxChange={(max) => onChange({ ...uniform, max })}
      />
    );
  } else {
    const colorError = colorDraftError(uniform.draft);
    typeFields = (
      <ColorField
        idPrefix={idPrefix}
        uniformName={uniform.name}
        draft={uniform.draft}
        validColor={uniform.valid}
        error={colorError}
        onDraftChange={(draft) => {
          const valid = colorToValidHex(draft);
          onChange({
            ...uniform,
            draft,
            valid: valid ?? uniform.valid,
          });
        }}
        onColorChange={(color) =>
          onChange({
            ...uniform,
            draft: color,
            valid: color,
          })
        }
      />
    );
  }

  function updateType(type: UniformType) {
    onChange(changeUniformType(uniform, type));
  }

  return (
    <div className={s.row} role="listitem">
      <div className={s.columnStart}>
        <TypeSelect
          value={uniform.type}
          uniformName={uniform.name}
          onChange={updateType}
        />
        <label className={s.name}>
          <span className={s.label}>Name</span>
          <input
            className={s.input}
            id={`${idPrefix}-name`}
            type="text"
            value={uniform.name}
            aria-invalid={uniformNameError ? true : undefined}
            aria-describedby={
              uniformNameError ? `${idPrefix}-name-error` : undefined
            }
            onChange={(event) =>
              onChange({ ...uniform, name: event.currentTarget.value })
            }
          />
          {uniformNameError ? (
            <span
              className={s.error}
              id={`${idPrefix}-name-error`}
              role="alert"
            >
              {uniformNameError}
            </span>
          ) : null}
        </label>
      </div>

      <div className={s.columnEnd}>
        <div className={s.typeFields}>{typeFields}</div>

        <div className={s.removeContainer}>
          <button
            className={s.remove}
            type="button"
            aria-label={`Remove uniform ${uniform.name || "unnamed"}`}
            onClick={onRemove}
          >
            <span aria-hidden="true">
              <svg viewBox="0 0 16 16" width={16} height={16} fill="none">
                <path
                  d="M4 4 L 12 12 M 12 4 L 4 12"
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              </svg>
            </span>
            <span className={s.srOnly}>Remove</span>
          </button>
        </div>
      </div>
    </div>
  );
}
