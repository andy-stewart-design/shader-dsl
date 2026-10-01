// Phase 2: use real compiler and renderer source imports. Plans are not a
// workspace package, so this uses source-relative paths. Workspace package
// exports and bundle isolation are checked by their own package tests.
import { compileFragmentArtifact } from "../../packages/core/src/browser.js";
import type { ShaderDiagnostic } from "../../packages/core/src/index.js";
import { ShdrRuntimeError } from "../../packages/runtime/src/errors.js";
import type {
  RendererBackend,
  RuntimeErrorKind,
} from "../../packages/runtime/src/errors.js";
import type { Renderer } from "../../packages/runtime/src/types.js";
import {
  createWebGlRenderer,
  type WebGlRenderer,
} from "../../packages/runtime/src/webgl.js";
import {
  createWebGpuRenderer,
  type WebGpuRenderer,
} from "../../packages/runtime/src/webgpu.js";
import type {
  CompiledFragmentArtifact,
  ShaderDefaultUniform,
} from "../../packages/shdr/src/index.js";

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
