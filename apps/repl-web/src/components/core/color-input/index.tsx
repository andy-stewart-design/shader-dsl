import s from "./style.module.css";

interface ColorInputProps {
  idPrefix: string;
  uniformName: string;
  draft: string;
  onDraftChange: (value: string) => void;
  validColor: string;
  onColorChange: (value: string) => void;
  error: string | null;
  className?: string;
}

export default function ColorInput({
  idPrefix,
  uniformName,
  draft,
  onDraftChange,
  validColor,
  onColorChange,
  error,
  className,
}: ColorInputProps) {
  const colorId = `${idPrefix}-color`;
  const textId = `${idPrefix}-hex`;
  const errorId = `${idPrefix}-color-error`;

  return (
    <div className={[s.container, className].filter(Boolean).join(" ")}>
      <label className={s.colorPicker} style={{ backgroundColor: validColor }}>
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
        <span className={s.srOnly}>
          Hex color for {uniformName || "unnamed uniform"}
        </span>
        <input
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
  );
}
