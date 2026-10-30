import { useId } from "react";
import {
  colorDraftError,
  colorToValidHex,
  nameError,
  numberDraftError,
} from "./helpers";
import { ColorField } from "./color-field";
import { FloatFields } from "./float-fields";
import { TypeSelect } from "./type-select";
import type { Uniform, UniformType } from "./types";
import s from "./style.module.css";

interface UniformRowProps {
  uniform: Uniform;
  duplicateName: boolean;
  onChange: (uniform: Uniform) => void;
  onRemove: () => void;
}

export function UniformRow({
  uniform,
  duplicateName,
  onChange,
  onRemove,
}: UniformRowProps) {
  const idPrefix = `uniform-${useId().replaceAll(":", "")}`;
  const uniformNameError = nameError(uniform.name, duplicateName);
  const valueError = numberDraftError(uniform.float.value, "Value");
  const minError = numberDraftError(uniform.float.min, "Min");
  const maxError = numberDraftError(uniform.float.max, "Max");
  const valueNumber = Number(uniform.float.value);
  const minNumber = Number(uniform.float.min);
  const maxNumber = Number(uniform.float.max);
  const hasValidRange = !minError && !maxError;
  const rangeError =
    hasValidRange && minNumber >= maxNumber
      ? "Min must be less than max."
      : null;
  const outOfRangeError =
    !valueError && !rangeError && hasValidRange
      ? valueNumber < minNumber || valueNumber > maxNumber
        ? "Value is outside the selected range."
        : null
      : null;
  const colorError = colorDraftError(uniform.color.draft);

  function updateType(type: UniformType) {
    onChange({ ...uniform, type });
  }

  return (
    <div className={s.row} role="listitem">
      <label className={s.field}>
        <span className={s.fieldLabel}>Name</span>
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
          <span className={s.error} id={`${idPrefix}-name-error`} role="alert">
            {uniformNameError}
          </span>
        ) : null}
      </label>

      <TypeSelect
        value={uniform.type}
        uniformName={uniform.name}
        onChange={updateType}
      />

      {uniform.type === "float" ? (
        <FloatFields
          idPrefix={idPrefix}
          value={uniform.float.value}
          min={uniform.float.min}
          max={uniform.float.max}
          valueError={outOfRangeError ?? valueError}
          minError={minError}
          maxError={maxError}
          rangeError={rangeError}
          onValueChange={(value) =>
            onChange({ ...uniform, float: { ...uniform.float, value } })
          }
          onMinChange={(min) =>
            onChange({ ...uniform, float: { ...uniform.float, min } })
          }
          onMaxChange={(max) =>
            onChange({ ...uniform, float: { ...uniform.float, max } })
          }
        />
      ) : (
        <ColorField
          idPrefix={idPrefix}
          uniformName={uniform.name}
          draft={uniform.color.draft}
          validColor={uniform.color.valid}
          error={colorError}
          onDraftChange={(draft) => {
            const valid = colorToValidHex(draft);
            onChange({
              ...uniform,
              color: {
                draft,
                valid: valid ?? uniform.color.valid,
              },
            });
          }}
          onColorChange={(color) =>
            onChange({
              ...uniform,
              color: { draft: color, valid: color },
            })
          }
        />
      )}

      <div className={s.removeButtonContainer}>
        <button
          className={s.removeButton}
          type="button"
          aria-label={`Remove uniform ${uniform.name || "unnamed"}`}
          onClick={onRemove}
        >
          <span aria-hidden="true">×</span>
          <span className={s.srOnly}>Remove</span>
        </button>
      </div>
    </div>
  );
}
