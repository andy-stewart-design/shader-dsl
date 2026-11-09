import ColorInput from "#/components/core/color-input";
import s from "./style.module.css";

interface ColorFieldProps {
  idPrefix: string;
  uniformName: string;
  draft: string;
  validColor: string;
  error: string | null;
  onDraftChange: (value: string) => void;
  onColorChange: (value: string) => void;
}

export default function ColorField({
  idPrefix,
  uniformName,
  draft,
  validColor,
  error,
  onDraftChange,
  onColorChange,
}: ColorFieldProps) {
  const errorId = `${idPrefix}-color-error`;

  return (
    <div className={s.colorField}>
      <span className={s.fieldLabel}>Value</span>
      <ColorInput
        idPrefix={idPrefix}
        uniformName={uniformName}
        draft={draft}
        validColor={validColor}
        onDraftChange={onDraftChange}
        onColorChange={onColorChange}
        error={error}
      />
      {error ? (
        <span className={s.error} id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
