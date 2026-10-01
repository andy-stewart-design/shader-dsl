// Phase 1: compiler/artifact use real source types and values. Plans are not a
// workspace package, so use source-relative imports here; the Vite fixture
// checks the published workspace subpath and authored-module type. Renderer
// declarations below remain sketches until phase 2 supplies @shdr/runtime.
import { compileFragmentArtifact } from "../../packages/core/src/browser.js";
import type { ShaderDiagnostic } from "../../packages/core/src/index.js";
import type {
  CompiledFragmentArtifact,
  ShaderDefaultUniform,
} from "../../packages/shdr/src/index.js";

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
// The Vite fixture checks that default export is typed CompiledFragmentArtifact
// by shdr's DSL; Vite transforms it into literal artifact data.
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
