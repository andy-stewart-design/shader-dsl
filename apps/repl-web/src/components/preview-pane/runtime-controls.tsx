import type { RuntimeUniform } from "./uniform-controls";
import s from "./style.module.css";

export interface RuntimeControlsProps {
  uniforms: readonly RuntimeUniform[];
  values: Readonly<Record<string, number | string>>;
  onValueChange: (name: string, value: number | string) => void;
}

export function RuntimeControls({
  uniforms,
  values,
  onValueChange,
}: RuntimeControlsProps) {
  return (
    <div className={s.controls} aria-label="Runtime uniform controls">
      <div>
        {uniforms.length === 0 ? <span>No applied uniforms.</span> : null}
        {uniforms.map((uniform) => {
          const value = values[uniform.name] ?? uniform.defaultValue;
          return uniform.type === "float" ? (
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
              <output>
                {typeof value === "number" ? value : uniform.defaultValue}
              </output>
            </label>
          ) : (
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
        })}
      </div>
    </div>
  );
}
