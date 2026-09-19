import { generateFragment, lowerFragment } from "@shdr/core";
import type {
  ShaderDiagnostic,
  ShaderTarget,
  TextRange,
} from "@shdr/core";
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { WebGlRenderer } from "./webgl-renderer.ts";
import { validateWgsl } from "./wgsl-validator.ts";

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
  readonly outputs: Readonly<Record<ShaderTarget, string>>;
}

interface CompilationFailure {
  readonly ok: false;
  readonly durationMs: number;
  readonly diagnostics: readonly ShaderDiagnostic[];
  readonly outputs?: undefined;
}

type Compilation = CompilationSuccess | CompilationFailure;
type ValidationState =
  | "pending"
  | "success"
  | "error"
  | "unavailable"
  | "blocked";

interface ValidationResult {
  readonly state: ValidationState;
  readonly message: string;
}

type TargetValidations = Readonly<Record<ShaderTarget, ValidationResult>>;

const INITIAL_COMPILATION = compileInitialSource();

const PENDING_VALIDATIONS: TargetValidations = {
  "glsl-es-300": {
    state: "pending",
    message: "Waiting for WebGL 2 compilation and rendering.",
  },
  wgsl: {
    state: "pending",
    message: "Checking WebGPU availability.",
  },
};

const BLOCKED_VALIDATIONS: TargetValidations = {
  "glsl-es-300": {
    state: "blocked",
    message: "Blocked by shared source diagnostics.",
  },
  wgsl: {
    state: "blocked",
    message: "Blocked by shared source diagnostics.",
  },
};

function App() {
  const [source, setSource] = useState(INITIAL_SOURCE);
  const [compiledSource, setCompiledSource] = useState(INITIAL_SOURCE);
  const [compilation, setCompilation] =
    useState<Compilation>(INITIAL_COMPILATION);
  const [selectedTarget, setSelectedTarget] =
    useState<ShaderTarget>("glsl-es-300");
  const [validations, setValidations] =
    useState<TargetValidations>(PENDING_VALIDATIONS);
  const [hasSuccessfulRender, setHasSuccessfulRender] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGlRenderer>(null);
  const validationRun = useRef(0);
  const isDirty = source !== compiledSource;

  const validateOutputs = useCallback(
    async (outputs: Readonly<Record<ShaderTarget, string>>) => {
      const run = ++validationRun.current;
      setValidations(PENDING_VALIDATIONS);

      const renderer = rendererRef.current;
      if (!renderer) {
        setValidations((current) => ({
          ...current,
          "glsl-es-300": {
            state: "error",
            message: "WebGL 2 renderer initialization failed.",
          },
        }));
      } else {
        try {
          const boundUniforms = renderer.setFragmentShader(
            outputs["glsl-es-300"],
          );
          setHasSuccessfulRender(true);
          setValidations((current) => ({
            ...current,
            "glsl-es-300": {
              state: "success",
              message:
                "GLSL compiled, linked, and rendered in WebGL 2. " +
                `Bound uniforms: ${boundUniforms.join(", ") || "none"}.`,
            },
          }));
        } catch (error) {
          setValidations((current) => ({
            ...current,
            "glsl-es-300": {
              state: "error",
              message: errorMessage(error),
            },
          }));
        }
      }

      const wgsl = await validateWgsl(outputs.wgsl);
      if (validationRun.current !== run) return;
      setValidations((current) => ({
        ...current,
        wgsl,
      }));
    },
    [],
  );

  useEffect(() => {
    if (canvasRef.current) {
      try {
        rendererRef.current = new WebGlRenderer(canvasRef.current);
      } catch {
        rendererRef.current = null;
      }
    }
    const frame = requestAnimationFrame(() => {
      void validateOutputs(INITIAL_COMPILATION.outputs);
    });
    return () => {
      cancelAnimationFrame(frame);
      validationRun.current += 1;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [validateOutputs]);

  const compile = () => {
    const next = compileBothTargets(source);
    setCompilation(next);
    setCompiledSource(source);

    if (!next.ok) {
      validationRun.current += 1;
      setValidations(BLOCKED_VALIDATIONS);
      return;
    }

    void validateOutputs(next.outputs);
  };

  const selected = TARGETS.find(
    ({ target }) => target === selectedTarget,
  );
  if (!selected) throw new Error(`Unknown selected target: ${selectedTarget}`);
  const selectedValidation = validations[selectedTarget];
  const previewIsPreserved =
    hasSuccessfulRender && validations["glsl-es-300"].state !== "success";

  return (
    <div className="repl-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Shdr proof of concept</p>
          <h1>Fragment shader REPL</h1>
          <p className="subtitle">
            Compile one typed IR to two targets, validate both in the browser,
            and render the GLSL result with WebGL 2.
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

        <section className="panel preview-panel" aria-labelledby="preview-title">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">WebGL 2</p>
              <h2 id="preview-title">Rendered GLSL</h2>
            </div>
            <Status
              state={validations["glsl-es-300"].state}
              label={validationLabel(validations["glsl-es-300"].state)}
            />
          </div>
          <div className="preview-body">
            <div className="preview-canvas">
              <canvas ref={canvasRef} width="512" height="512" />
              <p>
                Resolution follows the display size. Pointer coordinates use a
                top-left origin; time restarts at zero after each successful
                compile and advances in seconds.
              </p>
            </div>
            <div className="validation-list" aria-label="Target validation results">
              {TARGETS.map(({ target, label }) => {
                const validation = validations[target];
                return (
                  <div
                    className="validation-result"
                    data-validation-state={validation.state}
                    data-validation-target={target}
                    key={target}
                  >
                    <div>
                      <strong>{label}</strong>
                      <Status
                        state={validation.state}
                        label={validationLabel(validation.state)}
                      />
                    </div>
                    <p>{validation.message}</p>
                  </div>
                );
              })}
              {previewIsPreserved ? (
                <p className="preserved-note">
                  The canvas preserves the last successful GLSL render.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="panel output-panel" aria-labelledby="output-title">
          <div className="target-tabs" role="tablist" aria-label="Shader output target">
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
                ? compilation.outputs[selectedTarget]
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
  const lowered = lowerFragment(source);

  if (!lowered.ok) {
    return {
      ok: false,
      durationMs: performance.now() - startedAt,
      diagnostics: lowered.diagnostics,
    };
  }

  const outputs = {
    "glsl-es-300": generateFragment(lowered.ir, "glsl-es-300"),
    wgsl: generateFragment(lowered.ir, "wgsl"),
  };
  return {
    ok: true,
    durationMs: performance.now() - startedAt,
    diagnostics: [],
    outputs,
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
      return "Validating";
    case "success":
      return "Valid";
    case "error":
      return "Invalid";
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default App;
