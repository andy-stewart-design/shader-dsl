import { useCallback, useRef, useState } from "react";
import { createUniform } from "./helpers";
import { UniformRow } from "./uniform-row";
import type { Uniform } from "./types";
import s from "./style.module.css";

export function UniformsPane() {
  const [uniforms, setUniforms] = useState<Uniform[]>([]);
  const nextId = useRef(0);

  const addUniform = useCallback(() => {
    const sequence = nextId.current;
    nextId.current += 1;
    const id = `uniform-${sequence}`;
    setUniforms((current) => [
      ...current,
      createUniform(
        id,
        sequence,
        current.map((uniform) => uniform.name),
      ),
    ]);
  }, []);

  const updateUniform = useCallback((updated: Uniform) => {
    setUniforms((current) =>
      current.map((uniform) => (uniform.id === updated.id ? updated : uniform)),
    );
  }, []);

  const removeUniform = useCallback((id: string) => {
    setUniforms((current) => current.filter((uniform) => uniform.id !== id));
  }, []);

  return (
    <div className={s.pane}>
      <div className={s.intro}>
        <div>
          <h2 className={s.heading}>Uniforms</h2>
          <p className={s.description}>
            Configure values for this shader preview. These controls are local
            to the editor for now.
          </p>
        </div>
        <button className={s.newButton} type="button" onClick={addUniform}>
          <span aria-hidden="true">+</span>
          New uniform
        </button>
      </div>

      {uniforms.length > 0 ? (
        <div className={s.uniformList} role="list" aria-label="Uniforms">
          <div className={s.columnHeader} aria-hidden="true">
            <span>Name</span>
            <span>Type</span>
            <span>Value</span>
            <span>Min</span>
            <span>Max</span>
          </div>
          {uniforms.map((uniform) => {
            const duplicateName =
              uniform.name.trim() !== "" &&
              uniforms.some(
                (other) =>
                  other.id !== uniform.id &&
                  other.name.trim() === uniform.name.trim(),
              );

            return (
              <UniformRow
                key={uniform.id}
                uniform={uniform}
                duplicateName={duplicateName}
                onChange={updateUniform}
                onRemove={() => removeUniform(uniform.id)}
              />
            );
          })}
        </div>
      ) : (
        <div className={s.emptyState}>
          <p>No uniforms yet.</p>
          <p className={s.emptyHint}>
            Add a uniform to set up a local value, range, or color.
          </p>
        </div>
      )}
    </div>
  );
}

const Parent = { Main: UniformsPane };
export default Parent;
