import { ShdrRuntimeError } from "@shdr/runtime/errors";
import type { Renderer } from "@shdr/runtime/types";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
import { createWebGpuRenderer } from "@shdr/runtime/webgpu";
import type { CompiledFragmentArtifact } from "shdr";

export interface CreatePreviewOptions {
  readonly parent: HTMLElement;
  readonly artifact: CompiledFragmentArtifact;
  readonly playing?: boolean;
  readonly onError?: (error: ShdrRuntimeError) => void;
  readonly signal?: AbortSignal;
}

export interface PreviewHandle {
  readonly backend: "webgpu" | "webgl";
  readonly canvas: HTMLCanvasElement;
  readonly setShader: Renderer["setShader"];
  readonly setPlaying: Renderer["setPlaying"];
  readonly cancelPendingShader: Renderer["cancelPendingShader"];
  readonly destroy: () => void;
}

function abortedError(backend: "webgpu" | "webgl"): ShdrRuntimeError {
  return new ShdrRuntimeError(backend, "aborted", "Preview creation aborted.");
}

function isUnavailable(error: unknown): error is ShdrRuntimeError {
  return error instanceof ShdrRuntimeError && error.kind === "unavailable";
}

function makeCanvas(parent: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "Shader preview");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  parent.append(canvas);
  return canvas;
}

export async function createPreview({
  parent,
  artifact,
  playing,
  onError,
  signal,
}: CreatePreviewOptions): Promise<PreviewHandle> {
  const abortController = new AbortController();
  let canvas = makeCanvas(parent);
  let renderer: Renderer | undefined;
  let destroyed = false;

  const removeCanvas = (): void => {
    canvas.remove();
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    try {
      abortController.abort();
    } finally {
      try {
        renderer?.dispose();
      } finally {
        renderer = undefined;
        removeCanvas();
        signal?.removeEventListener("abort", destroy);
      }
    }
  };

  signal?.addEventListener("abort", destroy, { once: true });
  if (signal?.aborted) {
    destroy();
    throw abortedError("webgpu");
  }

  const options = {
    playing,
    onError,
    signal: abortController.signal,
  };

  try {
    let backend: PreviewHandle["backend"];

    try {
      const created = await createWebGpuRenderer(canvas, artifact, options);
      if (destroyed || abortController.signal.aborted) {
        created.dispose();
        throw abortedError("webgpu");
      }
      renderer = created;
      backend = "webgpu";
    } catch (error) {
      if (destroyed || abortController.signal.aborted) {
        throw abortedError("webgpu");
      }
      if (!isUnavailable(error)) throw error;

      removeCanvas();
      canvas = makeCanvas(parent);
      const created = await createWebGlRenderer(canvas, artifact, options);
      if (destroyed || abortController.signal.aborted) {
        created.dispose();
        throw abortedError("webgl");
      }
      renderer = created;
      backend = "webgl";
    }

    const activeRenderer = renderer;
    if (!activeRenderer || destroyed || abortController.signal.aborted) {
      activeRenderer?.dispose();
      throw abortedError(backend);
    }

    return {
      backend,
      canvas,
      setShader: activeRenderer.setShader.bind(activeRenderer),
      setPlaying: activeRenderer.setPlaying.bind(activeRenderer),
      cancelPendingShader:
        activeRenderer.cancelPendingShader.bind(activeRenderer),
      destroy,
    };
  } catch (error) {
    try {
      destroy();
    } catch {
      // Preserve the initial creation error when teardown itself fails.
    }
    throw error;
  }
}
