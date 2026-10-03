import { useState } from "react";
import { compileFragmentArtifact } from "@shdr/core/browser";
import {
  useShaderPreviews,
  type ValidationState,
} from "./use-shader-previews.ts";
import type { ShaderDiagnostic, ShaderTarget, TextRange } from "@shdr/core";
import type { CompiledFragmentArtifact } from "shdr";
import "./App.css";

const INITIAL_SOURCE = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const color = vec4(uv.x, uv.y, 0, 1);

  return color;
});
`;

const TARGETS: readonly {
  readonly target: ShaderTarget;
  readonly label: string;
  readonly language: string;
}[] = [
  { target: "glsl-es-300", label: "GLSL ES 3.00", language: "GLSL" },
  { target: "wgsl", label: "WGSL", language: "WGSL" },
];

interface CompilationSuccess {
  readonly ok: true;
  readonly durationMs: number;
  readonly diagnostics: readonly [];
  readonly artifact: CompiledFragmentArtifact;
}

interface CompilationFailure {
  readonly ok: false;
  readonly durationMs: number;
  readonly diagnostics: readonly ShaderDiagnostic[];
  readonly artifact?: undefined;
}

type Compilation = CompilationSuccess | CompilationFailure;
const INITIAL_COMPILATION = compileInitialSource();

function App() {
  const [source, setSource] = useState(INITIAL_SOURCE);
  const [compiledSource, setCompiledSource] = useState(INITIAL_SOURCE);
  const [compilation, setCompilation] =
    useState<Compilation>(INITIAL_COMPILATION);
  const [selectedTarget, setSelectedTarget] =
    useState<ShaderTarget>("glsl-es-300");
  const {
    canvasRef,
    gpuCanvasRef,
    validations,
    hasSuccessfulRender,
    renderOutputs,
    block,
    updateMouse,
    updateUniforms,
    resetUniforms,
  } = useShaderPreviews(INITIAL_COMPILATION.artifact);
  const isDirty = source !== compiledSource;
  const demoDeclarations = compilation.ok
    ? compilation.artifact.custom?.declarations
    : undefined;
  const hasExampleUniforms =
    demoDeclarations?.length === 2 &&
    demoDeclarations[0]?.name === "color" &&
    demoDeclarations[0]?.type === "vec3" &&
    demoDeclarations[1]?.name === "gain" &&
    demoDeclarations[1]?.type === "f32";

  const compile = () => {
    const next = compileBothTargets(source);
    setCompilation(next);
    setCompiledSource(source);
    if (next.ok) renderOutputs(next.artifact);
    else block();
  };

  const selected = TARGETS.find(({ target }) => target === selectedTarget);
  if (!selected) throw new Error(`Unknown selected target: ${selectedTarget}`);
  const selectedValidation = validations[selectedTarget];
  return (
    <div className="repl-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Shdr proof of concept</p>
          <h1>Fragment shader REPL</h1>
          <p className="subtitle">
            Compile one typed IR to two targets and render it in WebGL 2 and
            WebGPU where available.
          </p>
        </div>
        <button className="compile-button" type="button" onClick={compile}>
          Compile both targets
        </button>
      </header>

      <main className="workspace">
        <section className="panel source-panel" aria-labelledby="source-title">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Input</p>
              <h2 id="source-title">Shader source</h2>
            </div>
            <Status
              state={isDirty ? "pending" : "success"}
              label={isDirty ? "Uncompiled changes" : "Compiled"}
            />
          </div>
          <textarea
            aria-label="Shader source editor"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                compile();
              }
            }}
            spellCheck={false}
          />
          <p className="keyboard-hint">
            Compile with <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd>
          </p>
        </section>

        <section
          className="panel diagnostics-panel"
          aria-labelledby="diagnostics-title"
        >
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Shared semantic pass</p>
              <h2 id="diagnostics-title">Diagnostics</h2>
            </div>
            <Status
              state={compilation.ok ? "success" : "error"}
              label={
                compilation.ok
                  ? "No errors"
                  : `${compilation.diagnostics.length} error${compilation.diagnostics.length === 1 ? "" : "s"}`
              }
            />
          </div>
          <div className="diagnostics" aria-live="polite">
            <p className="compilation-time">
              Compilation time:{" "}
              <strong>{formatDuration(compilation.durationMs)}</strong>
            </p>
            {compilation.ok ? (
              <p className="empty-state">No shared compiler diagnostics.</p>
            ) : (
              <ol>
                {compilation.diagnostics.map((diagnostic, index) => {
                  const location = sourceLocation(
                    compiledSource,
                    diagnostic.range,
                  );
                  return (
                    <li
                      key={`${diagnostic.code}-${diagnostic.range.start}-${index}`}
                    >
                      <div>
                        <strong>{diagnostic.code}</strong>
                        <span>{location}</span>
                      </div>
                      <p>{diagnostic.message}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>

        <section
          className="panel preview-panel"
          aria-labelledby="preview-title"
        >
          <div className="panel-header">
            <div>
              <p className="panel-kicker">WebGL 2 / WebGPU</p>
              <h2 id="preview-title">Fragment previews</h2>
            </div>
          </div>
          <div className="preview-body">
            <div className="preview-grid" aria-label="Target render results">
              {TARGETS.map(({ target, label }) => {
                const result = validations[target];
                return (
                  <div
                    className="preview-target"
                    data-validation-state={result.state}
                    data-validation-target={target}
                    key={target}
                  >
                    <div className="preview-target-header">
                      <strong>
                        {target === "wgsl" ? "WebGPU" : "WebGL 2"} · {label}
                      </strong>
                      <Status
                        state={result.state}
                        label={validationLabel(result.state)}
                      />
                    </div>
                    <canvas
                      aria-label={`${label} preview`}
                      data-render-target={target}
                      height="512"
                      onPointerMove={updateMouse}
                      ref={target === "wgsl" ? gpuCanvasRef : canvasRef}
                      width="512"
                    />
                    <p className="render-message">{result.message}</p>
                    {hasSuccessfulRender[target] &&
                    result.state !== "success" ? (
                      <p className="preserved-note">
                        Last successful {label} render remains visible.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="preview-hint">
              Both previews use physical-pixel resolution, a shared top-left
              pointer position, and a shared time origin for each successfully
              lowered source. WebGL 2 stays usable when WebGPU is unavailable.
            </p>
            {hasExampleUniforms &&
            validations["glsl-es-300"].state === "success" ? (
              <div className="example-uniform-actions">
                <button
                  type="button"
                  onClick={() =>
                    updateUniforms({ color: [0.75, 0.25, 0.5], gain: 0.5 })
                  }
                >
                  Set example uniforms
                </button>
                <button type="button" onClick={resetUniforms}>
                  Reset custom defaults
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel output-panel" aria-labelledby="output-title">
          <div
            className="target-tabs"
            role="tablist"
            aria-label="Shader output target"
          >
            {TARGETS.map(({ target, label }) => (
              <button
                aria-controls="target-output"
                aria-selected={target === selectedTarget}
                id={`target-tab-${target}`}
                key={target}
                onClick={() => setSelectedTarget(target)}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="panel-header output-header">
            <div>
              <p className="panel-kicker">{selected.language} backend</p>
              <h2 id="output-title">{selected.label} output</h2>
            </div>
            <Status
              state={selectedValidation.state}
              label={validationLabel(selectedValidation.state)}
            />
          </div>
          <pre
            aria-labelledby={`target-tab-${selectedTarget}`}
            data-target={selectedTarget}
            id="target-output"
            role="tabpanel"
          >
            <code>
              {compilation.ok
                ? selectedTarget === "wgsl"
                  ? compilation.artifact.wgsl
                  : compilation.artifact.glsl
                : "Fix the shared source diagnostics to generate this target."}
            </code>
          </pre>
        </section>
      </main>
    </div>
  );
}

function Status({
  state,
  label,
}: {
  readonly state: ValidationState;
  readonly label: string;
}) {
  return <span className={`status status-${statusTone(state)}`}>{label}</span>;
}

function compileInitialSource(): CompilationSuccess {
  const compilation = compileBothTargets(INITIAL_SOURCE);
  if (!compilation.ok) {
    throw new Error("The REPL's initial shader must compile successfully.");
  }
  return compilation;
}

function compileBothTargets(source: string): Compilation {
  const startedAt = performance.now();
  const compiled = compileFragmentArtifact(source);
  return compiled.ok
    ? {
        ok: true,
        durationMs: performance.now() - startedAt,
        diagnostics: [],
        artifact: compiled.artifact,
      }
    : {
        ok: false,
        durationMs: performance.now() - startedAt,
        diagnostics: compiled.diagnostics,
      };
}

function formatDuration(durationMs: number): string {
  return `${durationMs.toFixed(2)} ms`;
}

function sourceLocation(source: string, range: TextRange): string {
  const prefix = source.slice(0, range.start);
  const lines = prefix.split("\n");
  return `Line ${lines.length}, column ${(lines.at(-1)?.length ?? 0) + 1}`;
}

function validationLabel(state: ValidationState): string {
  switch (state) {
    case "pending":
      return "Rendering";
    case "success":
      return "Rendered";
    case "error":
      return "Error";
    case "unavailable":
      return "Unavailable";
    case "blocked":
      return "Blocked";
  }
}

function statusTone(state: ValidationState): "ready" | "pending" | "error" {
  switch (state) {
    case "success":
      return "ready";
    case "pending":
    case "unavailable":
      return "pending";
    case "error":
    case "blocked":
      return "error";
  }
}

export default App;
