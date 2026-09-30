import { generateFragment, lowerFragment } from "@shdr/core";
import type { ShaderDiagnostic, ShaderTarget, TextRange } from "@shdr/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import "./App.css";
import { WebGlRenderer } from "./webgl-renderer.ts";
import { WebGpuRenderer, WebGpuUnavailableError } from "./webgpu-renderer.ts";

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
  "pending" | "success" | "error" | "unavailable" | "blocked";

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
    message: "Starting the WebGPU renderer.",
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
  const [hasSuccessfulRender, setHasSuccessfulRender] = useState<
    Readonly<Record<ShaderTarget, boolean>>
  >({
    "glsl-es-300": false,
    wgsl: false,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGlRenderer>(null);
  const gpuRendererRef = useRef<WebGpuRenderer>(null);
  const validationRun = useRef(0);
  const requestedOutputs = useRef<{
    readonly outputs: Readonly<Record<ShaderTarget, string>>;
    readonly run: number;
    readonly startedAt: number;
  } | null>(null);
  const gpuInitialization = useRef<ValidationResult | null>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const isDirty = source !== compiledSource;

  const renderWgsl = useCallback(
    async (
      renderer: WebGpuRenderer,
      source: string,
      run: number,
      startedAt: number,
    ) => {
      try {
        const boundUniforms = await renderer.setFragmentShader(
          source,
          startedAt,
        );
        if (!boundUniforms || validationRun.current !== run) return;
        setHasSuccessfulRender((current) => ({ ...current, wgsl: true }));
        setValidations((current) => ({
          ...current,
          wgsl: {
            state: "success",
            message:
              "WGSL compiled, pipelined, and rendered in WebGPU. " +
              `Bound uniforms: ${boundUniforms.join(", ") || "none"}.` +
              (renderer.warnings.length
                ? ` WGSL warnings: ${renderer.warnings.join("; ")}`
                : ""),
          },
        }));
      } catch (error) {
        if (validationRun.current !== run) return;
        setValidations((current) => ({
          ...current,
          wgsl: { state: "error", message: errorMessage(error) },
        }));
      }
    },
    [],
  );

  const renderOutputs = useCallback(
    (outputs: Readonly<Record<ShaderTarget, string>>) => {
      const run = ++validationRun.current;
      const startedAt = performance.now();
      requestedOutputs.current = { outputs, run, startedAt };
      setValidations({
        ...PENDING_VALIDATIONS,
        wgsl: gpuInitialization.current ?? PENDING_VALIDATIONS.wgsl,
      });

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
            startedAt,
          );
          setHasSuccessfulRender((current) => ({
            ...current,
            "glsl-es-300": true,
          }));
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
            "glsl-es-300": { state: "error", message: errorMessage(error) },
          }));
        }
      }
      if (gpuRendererRef.current) {
        void renderWgsl(gpuRendererRef.current, outputs.wgsl, run, startedAt);
      }
    },
    [renderWgsl],
  );

  useEffect(() => {
    let active = true;
    if (canvasRef.current) {
      try {
        rendererRef.current = new WebGlRenderer(canvasRef.current);
      } catch {
        rendererRef.current = null;
      }
    }
    const glRenderer = rendererRef.current;
    let gpuRenderer: WebGpuRenderer | null = null;
    // Defer device acquisition until after the first frame: StrictMode's
    // discarded effect must not configure the same canvas as the live effect.
    const frame = requestAnimationFrame(() => {
      if (!active) return;
      renderOutputs(INITIAL_COMPILATION.outputs);
      const canvas = gpuCanvasRef.current;
      if (!canvas) return;
      void WebGpuRenderer.create(canvas, (message) => {
        if (!active || !requestedOutputs.current) return;
        ++validationRun.current;
        setValidations((current) => ({
          ...current,
          wgsl: { state: "error", message },
        }));
      }).then(
        (renderer) => {
          if (!active) {
            renderer.dispose();
            return;
          }
          gpuRenderer = renderer;
          gpuRendererRef.current = renderer;
          renderer.setMouse(mouse.current.x, mouse.current.y);
          const requested = requestedOutputs.current;
          if (requested)
            void renderWgsl(
              renderer,
              requested.outputs.wgsl,
              requested.run,
              requested.startedAt,
            );
        },
        (error: unknown) => {
          if (!active) return;
          const failure: ValidationResult = {
            state:
              error instanceof WebGpuUnavailableError ? "unavailable" : "error",
            message: errorMessage(error),
          };
          gpuInitialization.current = failure;
          if (requestedOutputs.current) {
            setValidations((current) => ({ ...current, wgsl: failure }));
          }
        },
      );
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      requestedOutputs.current = null;
      gpuRenderer?.dispose();
      gpuRendererRef.current = null;
      glRenderer?.dispose();
      rendererRef.current = null;
    };
  }, [renderOutputs, renderWgsl]);

  const compile = () => {
    const next = compileBothTargets(source);
    setCompilation(next);
    setCompiledSource(source);

    if (!next.ok) {
      validationRun.current++;
      requestedOutputs.current = null;
      gpuRendererRef.current?.cancelPendingCompilation();
      setValidations(BLOCKED_VALIDATIONS);
      return;
    }
    renderOutputs(next.outputs);
  };

  const updateMouse = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    mouse.current = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
    rendererRef.current?.setMouse(mouse.current.x, mouse.current.y);
    gpuRendererRef.current?.setMouse(mouse.current.x, mouse.current.y);
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default App;
