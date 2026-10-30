import s from "./style.module.css";

interface FloatFieldsProps {
  idPrefix: string;
  value: string;
  min: string;
  max: string;
  valueError: string | null;
  minError: string | null;
  maxError: string | null;
  rangeError: string | null;
  onValueChange: (value: string) => void;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}

interface FloatInputProps {
  idPrefix: string;
  label: string;
  value: string;
  error: string | null;
  describedBy?: string;
  invalid?: boolean;
  additionalError?: { id: string; message: string };
  onChange: (value: string) => void;
}

function FloatInput({
  idPrefix,
  label,
  value,
  error,
  describedBy,
  invalid,
  additionalError,
  onChange,
}: FloatInputProps) {
  const inputId = `${idPrefix}-${label.toLowerCase()}`;
  const errorId = `${inputId}-error`;
  const errorDescription = [error ? errorId : null, describedBy]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      <input
        className={s.input}
        id={inputId}
        type="text"
        inputMode="decimal"
        value={value}
        aria-invalid={invalid || error ? true : undefined}
        aria-describedby={errorDescription || undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error ? (
        <span className={s.error} id={errorId} role="alert">
          {error}
        </span>
      ) : null}
      {additionalError ? (
        <span className={s.error} id={additionalError.id} role="alert">
          {additionalError.message}
        </span>
      ) : null}
    </label>
  );
}

export function FloatFields({
  idPrefix,
  value,
  min,
  max,
  valueError,
  minError,
  maxError,
  rangeError,
  onValueChange,
  onMinChange,
  onMaxChange,
}: FloatFieldsProps) {
  const rangeErrorId = `${idPrefix}-range-error`;

  return (
    <>
      <FloatInput
        idPrefix={idPrefix}
        label="Value"
        value={value}
        error={valueError}
        onChange={onValueChange}
      />
      <FloatInput
        idPrefix={idPrefix}
        label="Min"
        value={min}
        error={minError}
        describedBy={rangeError ? rangeErrorId : undefined}
        invalid={Boolean(rangeError)}
        onChange={onMinChange}
      />
      <FloatInput
        idPrefix={idPrefix}
        label="Max"
        value={max}
        error={maxError}
        describedBy={rangeError ? rangeErrorId : undefined}
        invalid={Boolean(rangeError)}
        additionalError={
          rangeError ? { id: rangeErrorId, message: rangeError } : undefined
        }
        onChange={onMaxChange}
      />
    </>
  );
}
