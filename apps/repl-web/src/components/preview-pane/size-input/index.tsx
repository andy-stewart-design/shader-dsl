import { useEffect, useRef } from "react";
import {
  useHeightRatio,
  usePreviewActions,
  useWidthRatio,
} from "../../../stores/preview";
import s from "./style.module.css";

export default function SizeInput() {
  const widthRatio = useWidthRatio();
  const heightRatio = useHeightRatio();
  const { setWidthRatio, setHeightRatio } = usePreviewActions();

  return (
    <div className={s.container}>
      <RatioInput
        name="widthRatio"
        label="Canvas width ratio"
        value={widthRatio}
        onChange={setWidthRatio}
      />
      <span className={s.separator} aria-hidden="true">
        ×
      </span>
      <RatioInput
        name="heightRatio"
        label="Canvas height ratio"
        value={heightRatio}
        onChange={setHeightRatio}
      />
    </div>
  );
}

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
    <label className={s.field}>
      <span className={s.srOnly}>{label}</span>
      <input
        className={s.input}
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
