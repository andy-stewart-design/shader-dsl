import type { RuntimeUniform } from "../uniform-controls";
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
  return (
    <div
      className={s.controls}
      aria-label="Runtime uniform controls"
    >
      <div>
        {uniforms.length === 0 ? <span>No applied uniforms.</span> : null}
        {uniforms.map((uniform) => {
          const value = values[uniform.name] ?? uniform.defaultValue;
          return uniform.type === "float" ? (
            <FloatUniformInput
              value={value}
              uniform={uniform}
              onValueChange={onValueChange}
            />
          ) : (
            <ColorUniformInput
              value={value}
              uniform={uniform}
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

  return (
    <label key={uniform.name}>
      {uniform.name}
      <input
        type="range"
        min={uniform.min}
        max={uniform.max}
        step="any"
        value={typeof value === "number" ? value : uniform.defaultValue}
        onChange={(event) =>
          onValueChange(uniform.name, Number(event.currentTarget.value))
        }
      />
      <output>{currentValue.toFixed(2)}</output>
    </label>
  );
}

type ColorUniform = Extract<RuntimeUniform, { type: "color" }>;
interface ColorUniformInputProps {
  value: string | number;
  uniform: ColorUniform;
  onValueChange: (name: string, value: number | string) => void;
}

function ColorUniformInput({
  value,
  uniform,
  onValueChange,
}: ColorUniformInputProps) {
  return (
    <label key={uniform.name}>
      {uniform.name}
      <input
        type="color"
        value={typeof value === "string" ? value : uniform.defaultValue}
        onChange={(event) =>
          onValueChange(uniform.name, event.currentTarget.value)
        }
      />
    </label>
  );
}
