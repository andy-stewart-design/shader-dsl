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

export function ColorField({
  idPrefix,
  uniformName,
  draft,
  validColor,
  error,
  onDraftChange,
  onColorChange,
}: ColorFieldProps) {
  const colorId = `${idPrefix}-color`;
  const textId = `${idPrefix}-hex`;
  const errorId = `${idPrefix}-color-error`;

  return (
    <div className={s.colorField}>
      <span className={s.fieldLabel}>Value</span>
      <div className={s.colorControls}>
        <label className={s.colorPickerLabel}>
          <span className={s.srOnly}>Color swatch</span>
          <input
            className={s.colorPicker}
            id={colorId}
            type="color"
            value={validColor}
            aria-label={`Choose color for ${uniformName || "unnamed uniform"}`}
            onChange={(event) => onColorChange(event.currentTarget.value)}
          />
        </label>
        <label className={s.hexField}>
          <span className={s.srOnly}>Hex color</span>
          <input
            className={s.input}
            id={textId}
            type="text"
            inputMode="text"
            autoCapitalize="off"
            spellCheck={false}
            value={draft}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder="#85befd"
            onChange={(event) => onDraftChange(event.currentTarget.value)}
          />
        </label>
      </div>
      {error ? (
        <span className={s.error} id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
