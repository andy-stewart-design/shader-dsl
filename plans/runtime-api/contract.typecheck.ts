// Gate 0 only: compile-only API sketches against local declarations. These
// declarations are NOT implementations or package exports. Replace them with
// actual type/value imports from shdr, @shdr/core/browser and the three
// @shdr/runtime subpaths as phases 1 and 2 land.
export {};

type ShaderDefaultUniform = "resolution" | "mouse" | "time";
interface CompiledFragmentArtifact {
  readonly glsl: string;
  readonly wgsl: string;
  readonly defaults: {
    readonly glsl: readonly ShaderDefaultUniform[];
    readonly wgsl: readonly ShaderDefaultUniform[];
  };
}
interface ShaderDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly range: { readonly start: number; readonly end: number };
  readonly severity: "error";
}
type CompileArtifactResult =
  | {
      readonly ok: true;
      readonly artifact: CompiledFragmentArtifact;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly artifact?: undefined;
      readonly diagnostics: readonly ShaderDiagnostic[];
    };
declare function compileFragmentArtifact(source: string): CompileArtifactResult;

type RendererBackend = "webgl" | "webgpu";
type RuntimeErrorKind =
  | "unavailable"
  | "surface"
  | "artifact"
  | "shader"
  | "draw"
  | "lost"
  | "aborted"
  | "disposed";
declare class ShdrRuntimeError extends Error {
  readonly backend: RendererBackend;
  readonly kind: RuntimeErrorKind;
  readonly cause?: unknown;
}
interface RendererOptions {
  readonly animate?: boolean;
  readonly onError?: (error: ShdrRuntimeError) => void;
  readonly signal?: AbortSignal;
  readonly startedAt?: number;
}
interface ShaderInstallOptions {
  readonly startedAt?: number;
}
type ShaderInstallResult =
  | {
      readonly status: "installed";
      readonly boundUniforms: readonly ShaderDefaultUniform[];
      readonly warnings: readonly string[];
    }
  | { readonly status: "superseded" };
interface Renderer {
  setShader(
    artifact: CompiledFragmentArtifact,
    options?: ShaderInstallOptions,
  ): Promise<ShaderInstallResult>;
  cancelPendingShader(): void;
  setPointerNormalized(x: number, y: number): void;
  draw(): Promise<void>;
  dispose(): void;
}
type WebGlRenderer = Renderer;
type WebGpuRenderer = Renderer;
declare function createWebGlRenderer(
  canvas: HTMLCanvasElement,
  artifact: CompiledFragmentArtifact,
  options?: RendererOptions,
): Promise<WebGlRenderer>;
declare function createWebGpuRenderer(
  canvas: HTMLCanvasElement,
  artifact: CompiledFragmentArtifact,
  options?: RendererOptions,
): Promise<WebGpuRenderer>;

// Actual host: import effect from "./effect.shdr.ts";
// Its default export is typed CompiledFragmentArtifact by shdr's DSL typing;
// Vite transforms it into literal artifact data before it runs in the browser.
declare const effect: CompiledFragmentArtifact;
declare const glCanvas: HTMLCanvasElement;
declare const gpuCanvas: HTMLCanvasElement;
declare function reportBackendError(
  backend: RendererBackend,
  kind: RuntimeErrorKind,
): void;
declare function showSourceDiagnostics(
  diagnostics: readonly ShaderDiagnostic[],
): void;

async function staticWebGlHost(): Promise<void> {
  const abort = new AbortController();
  let renderer: Renderer | undefined;
  try {
    renderer = await createWebGlRenderer(glCanvas, effect, {
      animate: false,
      signal: abort.signal,
      onError(error) {
        reportBackendError(error.backend, error.kind);
      },
    }); // First frame already drawn.
    await renderer.draw(); // One explicit frame; no RAF loop.
    const installed = await renderer.setShader(effect);
    if (installed.status === "installed") {
      const bound: readonly ShaderDefaultUniform[] = installed.boundUniforms;
      void bound;
    } else {
      const status: "superseded" = installed.status;
      void status;
    }
  } catch (error) {
    if (error instanceof ShdrRuntimeError) {
      reportBackendError(error.backend, error.kind);
    } else {
      throw error;
    }
  } finally {
    abort.abort();
    renderer?.dispose();
    renderer?.dispose(); // Idempotent.
  }
}

async function browserEditor(source: string): Promise<void> {
  const compiled = compileFragmentArtifact(source);
  if (!compiled.ok) {
    showSourceDiagnostics(compiled.diagnostics);
    return; // Previous shader remains installed.
  }
  // The same artifact can go to either renderer: no backend-selection facade.
  const epoch = performance.now();
  const gl = await createWebGlRenderer(glCanvas, compiled.artifact, {
    startedAt: epoch,
  });
  let gpu: WebGpuRenderer | undefined;
  try {
    try {
      gpu = await createWebGpuRenderer(gpuCanvas, compiled.artifact, {
        startedAt: epoch,
        onError(error) {
          reportBackendError(error.backend, error.kind);
        },
      });
    } catch (error) {
      if (
        !(error instanceof ShdrRuntimeError) ||
        error.kind !== "unavailable"
      ) {
        throw error;
      }
      reportBackendError(error.backend, error.kind); // WebGL stays alive.
    }

    const next = compileFragmentArtifact(source);
    if (!next.ok) {
      gl.cancelPendingShader();
      gpu?.cancelPendingShader();
      showSourceDiagnostics(next.diagnostics);
    } else {
      const sharedEpoch = performance.now();
      await Promise.all([
        gl.setShader(next.artifact, { startedAt: sharedEpoch }),
        gpu?.setShader(next.artifact, { startedAt: sharedEpoch }),
      ]);
    }
    gl.setPointerNormalized(0.25, 0.75);
    gpu?.setPointerNormalized(0.25, 0.75);
  } finally {
    gpu?.dispose();
    gl.dispose();
  }
}

// Negative type checks guard against accidentally reverting to a GLSL string.
// @ts-expect-error A GLSL string is not a compiled dual-target artifact.
void createWebGlRenderer(glCanvas, "#version 300 es");
// @ts-expect-error Only the explicitly supported backends are accepted.
reportBackendError("auto", "unavailable");
// @ts-expect-error Custom uniforms are not part of the v1 artifact.
void effect.customUniforms;
void staticWebGlHost;
void browserEditor;
