import { ShdrRuntimeError } from "@shdr/runtime/errors";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
import { createWebGpuRenderer } from "@shdr/runtime/webgpu";
import { compileShdrBody } from "../../src/compiler/compile-shdr-body.ts";
import { captureCanvas } from "../../src/preview/capture-canvas.ts";
import {
  createPreview,
  type PreviewHandle,
  type PreviewRendererFactories,
} from "../../src/preview/create-preview.ts";

const SHADER_BODY = `const uv = coord.xy / u.resolution;
return vec4(uv.x, uv.y, uv.x * (1 - uv.y), 1);`;

type BackendChoice = "auto" | "webgpu" | "webgl";

const backendSelect = document.querySelector<HTMLSelectElement>("#backend")!;
const captureButton = document.querySelector<HTMLButtonElement>("#capture")!;
const previewHost = document.querySelector<HTMLDivElement>("#preview")!;
const exportedHost = document.querySelector<HTMLDivElement>("#exported")!;
const downloadLink = document.querySelector<HTMLAnchorElement>("#download")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const backendLabel = document.querySelector<HTMLSpanElement>("#backend-label")!;
const dimensions = document.querySelector<HTMLSpanElement>("#dimensions")!;
document.querySelector<HTMLElement>("#source")!.textContent = SHADER_BODY;

let generation = 0;
let activeHandle: PreviewHandle | undefined;
let exportedUrl: string | undefined;

function unavailableFactory(backend: "webgpu" | "webgl") {
  return async (): Promise<never> => {
    throw new ShdrRuntimeError(
      backend,
      "unavailable",
      `${backend === "webgpu" ? "WebGPU" : "WebGL"} disabled by the probe fixture.`,
    );
  };
}

function factoriesFor(choice: BackendChoice): PreviewRendererFactories | undefined {
  if (choice === "auto") return undefined;
  if (choice === "webgpu") {
    return { webgpu: createWebGpuRenderer, webgl: unavailableFactory("webgl") };
  }
  return { webgpu: unavailableFactory("webgpu"), webgl: createWebGlRenderer };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clearExport(): void {
  if (exportedUrl !== undefined) URL.revokeObjectURL(exportedUrl);
  exportedUrl = undefined;
  exportedHost.replaceChildren();
  downloadLink.hidden = true;
  downloadLink.removeAttribute("href");
}

function disposeActive(): void {
  activeHandle?.destroy();
  activeHandle = undefined;
  previewHost.replaceChildren();
  clearExport();
  backendLabel.textContent = "Backend: —";
  dimensions.textContent = "Canvas: —";
}

async function captureCurrent(expectedGeneration: number): Promise<void> {
  const handle = activeHandle;
  if (!handle || expectedGeneration !== generation) return;
  captureButton.disabled = true;
  status.textContent = "Drawing current frame and encoding PNG…";
  try {
    await handle.draw();
    if (expectedGeneration !== generation || activeHandle !== handle) return;
    const captured = await captureCanvas(handle.canvas);
    if (expectedGeneration !== generation || activeHandle !== handle) return;
    clearExport();
    exportedUrl = URL.createObjectURL(captured.blob);
    const image = new Image();
    image.alt = `Captured ${captured.width} by ${captured.height} PNG`;
    image.src = exportedUrl;
    exportedHost.append(image);
    downloadLink.href = exportedUrl;
    downloadLink.hidden = false;
    dimensions.textContent = `Canvas: ${captured.width} × ${captured.height} px · ${captured.mimeType}`;
    status.textContent = "PNG captured from the current preview canvas.";
  } catch (error) {
    if (expectedGeneration === generation)
      status.textContent = `Capture failed: ${describeError(error)}`;
  } finally {
    if (expectedGeneration === generation) captureButton.disabled = false;
  }
}

async function load(choice: BackendChoice): Promise<void> {
  const expectedGeneration = ++generation;
  disposeActive();
  status.textContent = "Compiling and creating preview…";
  captureButton.disabled = true;
  const compiled = compileShdrBody(SHADER_BODY);
  if (!compiled.ok) {
    status.textContent = `Shader compilation failed: ${compiled.diagnostics[0]?.message ?? "unknown diagnostic"}`;
    return;
  }

  try {
    const handle = await createPreview(
      {
        parent: previewHost,
        artifact: compiled.artifact,
        playing: false,
        onError: (error) => {
          if (expectedGeneration === generation)
            status.textContent = `Preview error: ${describeError(error)}`;
        },
      },
      factoriesFor(choice),
    );
    if (expectedGeneration !== generation) {
      handle.destroy();
      return;
    }
    if (choice !== "auto" && handle.backend !== choice) {
      handle.destroy();
      throw new Error(`Fixture expected ${choice}, but renderer reported ${handle.backend}.`);
    }
    activeHandle = handle;
    backendLabel.textContent = `Backend: ${handle.backend} (reported by renderer)`;
    await captureCurrent(expectedGeneration);
  } catch (error) {
    if (expectedGeneration === generation)
      status.textContent = `Preview failed: ${describeError(error)}`;
  } finally {
    if (expectedGeneration === generation && activeHandle) captureButton.disabled = false;
  }
}

backendSelect.addEventListener("change", () => {
  void load(backendSelect.value as BackendChoice);
});
captureButton.addEventListener("click", () => void captureCurrent(generation));
void load("auto");
