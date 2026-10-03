import type { ShaderTarget } from "@shdr/core";
import { ShdrRuntimeError } from "@shdr/runtime/errors";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
import { createWebGpuRenderer } from "@shdr/runtime/webgpu";
import type {
  Renderer,
  RendererOptions,
  ShaderInstallResult,
} from "@shdr/runtime/types";
import type { CompiledFragmentArtifact, ShaderDefaultUniform } from "shdr";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type ValidationState =
  "pending" | "success" | "error" | "unavailable" | "blocked";
export interface ValidationResult {
  readonly state: ValidationState;
  readonly message: string;
}
type TargetValidations = Readonly<Record<ShaderTarget, ValidationResult>>;
type Request = {
  readonly artifact: CompiledFragmentArtifact;
  readonly run: number;
  readonly startedAt: number;
};
type PreviewConfig = {
  readonly create: (
    canvas: HTMLCanvasElement,
    artifact: CompiledFragmentArtifact,
    options: RendererOptions,
  ) => Promise<Renderer>;
  readonly success: string;
  readonly defaultBindings: "glsl" | "wgsl";
  readonly pending: string;
};
const TARGETS: readonly ShaderTarget[] = ["glsl-es-300", "wgsl"];
const PREVIEWS: Readonly<Record<ShaderTarget, PreviewConfig>> = {
  "glsl-es-300": {
    create: createWebGlRenderer,
    success: "GLSL compiled, linked, and rendered in WebGL 2.",
    defaultBindings: "glsl",
    pending: "Waiting for WebGL 2 compilation and rendering.",
  },
  wgsl: {
    create: createWebGpuRenderer,
    success: "WGSL compiled, pipelined, and rendered in WebGPU.",
    defaultBindings: "wgsl",
    pending: "Starting the WebGPU renderer.",
  },
};
const PENDING: TargetValidations = {
  "glsl-es-300": { state: "pending", message: PREVIEWS["glsl-es-300"].pending },
  wgsl: { state: "pending", message: PREVIEWS.wgsl.pending },
};
const BLOCKED: TargetValidations = {
  "glsl-es-300": {
    state: "blocked",
    message: "Blocked by shared source diagnostics.",
  },
  wgsl: { state: "blocked", message: "Blocked by shared source diagnostics." },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function successMessage(
  target: ShaderTarget,
  bindings: readonly ShaderDefaultUniform[],
  warnings: readonly string[] = [],
): string {
  return (
    `${PREVIEWS[target].success} Bound uniforms: ${bindings.join(", ") || "none"}.` +
    (warnings.length ? ` WGSL warnings: ${warnings.join("; ")}` : "")
  );
}

/** REPL-only coordination for two *independent* owned renderers, not a runtime facade. */
export function useShaderPreviews(initialArtifact: CompiledFragmentArtifact) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderers = useRef<Record<ShaderTarget, Renderer | null>>({
    "glsl-es-300": null,
    wgsl: null,
  });
  const failures = useRef<Record<ShaderTarget, ValidationResult | null>>({
    "glsl-es-300": null,
    wgsl: null,
  });
  const latest = useRef<Request | null>(null);
  const run = useRef(0);
  const mouse = useRef({ x: 0, y: 0 });
  const [validations, setValidations] = useState<TargetValidations>(PENDING);
  const [hasSuccessfulRender, setHasSuccessfulRender] = useState<
    Readonly<Record<ShaderTarget, boolean>>
  >({ "glsl-es-300": false, wgsl: false });

  const canvasFor = useCallback(
    (target: ShaderTarget) =>
      (target === "wgsl" ? gpuCanvasRef : canvasRef).current,
    [],
  );
  const report = useCallback(
    (target: ShaderTarget, result: ValidationResult) => {
      setValidations((current) => ({ ...current, [target]: result }));
      if (result.state === "success")
        setHasSuccessfulRender((current) => ({ ...current, [target]: true }));
    },
    [],
  );
  const installed = useCallback(
    (
      target: ShaderTarget,
      bindings: readonly ShaderDefaultUniform[],
      warnings: readonly string[] = [],
    ) => {
      report(target, {
        state: "success",
        message: successMessage(target, bindings, warnings),
      });
    },
    [report],
  );
  const replace = useCallback(
    async (target: ShaderTarget, renderer: Renderer, request: Request) => {
      try {
        const result: ShaderInstallResult = await renderer.setShader(
          request.artifact,
          { startedAt: request.startedAt },
        );
        if (result.status === "superseded" || run.current !== request.run)
          return;
        installed(target, result.boundUniforms, result.warnings);
      } catch (error) {
        if (run.current !== request.run) return;
        report(target, { state: "error", message: errorMessage(error) });
      }
    },
    [installed, report],
  );

  const renderOutputs = useCallback(
    (artifact: CompiledFragmentArtifact) => {
      const request: Request = {
        artifact,
        run: ++run.current,
        startedAt: performance.now(),
      };
      latest.current = request;
      setValidations({
        "glsl-es-300":
          failures.current["glsl-es-300"] ?? PENDING["glsl-es-300"],
        wgsl: failures.current.wgsl ?? PENDING.wgsl,
      });
      for (const target of TARGETS) {
        const renderer = renderers.current[target];
        if (renderer) void replace(target, renderer, request);
      }
    },
    [replace],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const owned = renderers.current;
    // StrictMode discards one effect; don't configure that effect's canvas.
    const frame = requestAnimationFrame(() => {
      if (!active) return;
      renderOutputs(initialArtifact);
      const initial = latest.current!;
      for (const target of TARGETS) {
        const canvas = canvasFor(target);
        if (!canvas) continue;
        void PREVIEWS[target]
          .create(canvas, initial.artifact, {
            signal: controller.signal,
            startedAt: initial.startedAt,
            onError(error) {
              if (!active) return;
              const failure: ValidationResult = {
                state: "error",
                message: errorMessage(error),
              };
              if (error.kind === "lost") {
                renderers.current[target]?.dispose();
                renderers.current[target] = null;
                failures.current[target] = failure;
                setHasSuccessfulRender((current) => ({
                  ...current,
                  [target]: false,
                }));
              }
              report(target, failure);
            },
          })
          .then(
            (renderer) => {
              if (!active) {
                renderer.dispose();
                return;
              }
              renderers.current[target] = renderer;
              renderer.setPointerNormalized(mouse.current.x, mouse.current.y);
              const requested = latest.current;
              if (!requested) return;
              if (requested.run === initial.run)
                installed(
                  target,
                  initial.artifact.defaults[PREVIEWS[target].defaultBindings],
                );
              else void replace(target, renderer, requested);
            },
            (error: unknown) => {
              if (!active) return;
              const failure: ValidationResult = {
                state:
                  target === "wgsl" &&
                  error instanceof ShdrRuntimeError &&
                  error.kind === "unavailable"
                    ? "unavailable"
                    : "error",
                message: errorMessage(error),
              };
              failures.current[target] = failure;
              report(target, failure);
            },
          );
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      controller.abort();
      for (const target of TARGETS) {
        owned[target]?.dispose();
        owned[target] = null;
      }
    };
  }, [initialArtifact, renderOutputs, canvasFor, installed, replace, report]);

  // REPL-only example controls operate on installed, schema-erased editor artifacts.
  // Each backend still owns its own validation, values, and drawing lifecycle.
  const updateUniforms = useCallback(
    (values: Parameters<Renderer["setUniforms"]>[0]) => {
      for (const target of TARGETS) {
        const renderer = renderers.current[target];
        if (!renderer) continue;
        try {
          renderer.setUniforms(values);
        } catch (error) {
          report(target, { state: "error", message: errorMessage(error) });
        }
      }
    },
    [report],
  );
  const resetUniforms = useCallback(() => {
    for (const target of TARGETS) {
      const renderer = renderers.current[target];
      if (!renderer) continue;
      try {
        renderer.resetUniforms();
      } catch (error) {
        report(target, { state: "error", message: errorMessage(error) });
      }
    }
  }, [report]);

  const block = useCallback(() => {
    run.current++;
    latest.current = null;
    for (const target of TARGETS)
      renderers.current[target]?.cancelPendingShader();
    setValidations(BLOCKED);
  }, []);
  const updateMouse = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      mouse.current = {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      };
      for (const target of TARGETS)
        renderers.current[target]?.setPointerNormalized(
          mouse.current.x,
          mouse.current.y,
        );
    },
    [],
  );

  return {
    canvasRef,
    gpuCanvasRef,
    validations,
    hasSuccessfulRender,
    renderOutputs,
    block,
    updateMouse,
    updateUniforms,
    resetUniforms,
  };
}
