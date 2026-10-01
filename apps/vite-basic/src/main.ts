import { ShdrRuntimeError } from "@shdr/runtime/errors";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
import { createWebGpuRenderer } from "@shdr/runtime/webgpu";
import type { Renderer } from "@shdr/runtime/types";
import type { CompiledFragmentArtifact } from "shdr";

import fragmentShader from "./gradient.shdr.ts";
import expandedShader from "./expanded.shdr.ts";
import mathBuiltinsShader from "./math-builtins.shdr.ts";
import "./style.css";

const shader: CompiledFragmentArtifact = fragmentShader;
const expanded: CompiledFragmentArtifact = expandedShader;
const math: CompiledFragmentArtifact = mathBuiltinsShader;
if (
  !expanded.glsl.includes("vec3(") ||
  !shader.wgsl.includes("shdr_fragment_main")
)
  throw new Error("The shader artifacts were not compiled by the Vite plugin.");

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("The Vite fixture requires an #app element.");
app.innerHTML = `
  <main>
    <h1>Shdr Vite/WebGL 2 + WebGPU fixture</h1>
    <canvas id="shader-canvas" width="512" height="512"></canvas>
    <p id="status" role="status">Compiling generated GLSL…</p>
    <canvas id="webgpu-canvas" width="512" height="512"></canvas>
    <p id="webgpu-status" role="status">Starting WebGPU…</p>
    <h2>Math builtins</h2>
    <canvas id="math-canvas" width="128" height="128"></canvas>
    <p id="math-status" role="status">Compiling generated math shader…</p>
  </main>
`;
const canvas = document.querySelector<HTMLCanvasElement>("#shader-canvas");
const status = document.querySelector<HTMLParagraphElement>("#status");
const gpuCanvas = document.querySelector<HTMLCanvasElement>("#webgpu-canvas");
const gpuStatus =
  document.querySelector<HTMLParagraphElement>("#webgpu-status");
const mathCanvas = document.querySelector<HTMLCanvasElement>("#math-canvas");
const mathStatus = document.querySelector<HTMLParagraphElement>("#math-status");
if (
  !canvas ||
  !status ||
  !gpuCanvas ||
  !gpuStatus ||
  !mathCanvas ||
  !mathStatus
)
  throw new Error("The shader fixture UI is incomplete.");

const renderers: Renderer[] = [];
const lifetime = new AbortController();
window.addEventListener(
  "pagehide",
  () => {
    lifetime.abort();
    renderers.forEach((renderer) => renderer.dispose());
  },
  { once: true },
);

async function renderWebGl(
  target: HTMLCanvasElement,
  label: HTMLParagraphElement,
  artifact: CompiledFragmentArtifact,
): Promise<void> {
  try {
    const renderer = await createWebGlRenderer(target, artifact, {
      signal: lifetime.signal,
      animate: false,
      onError(error) {
        target.dataset.renderStatus = "error";
        label.textContent = error.message;
      },
    });
    renderers.push(renderer);
    target.dataset.renderStatus = "success";
    label.textContent = "Generated GLSL compiled, linked, and rendered.";
  } catch (error) {
    target.dataset.renderStatus = "error";
    label.textContent = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

async function renderWebGpu(): Promise<void> {
  try {
    const renderer = await createWebGpuRenderer(gpuCanvas!, shader, {
      signal: lifetime.signal,
      animate: false,
      onError(error) {
        gpuCanvas!.dataset.renderStatus = "error";
        gpuStatus!.textContent = error.message;
      },
    });
    renderers.push(renderer);
    gpuCanvas!.dataset.renderStatus = "success";
    gpuStatus!.textContent = "Generated WGSL pipelined and rendered in WebGPU.";
  } catch (error) {
    gpuCanvas!.dataset.renderStatus =
      error instanceof ShdrRuntimeError && error.kind === "unavailable"
        ? "unavailable"
        : "error";
    gpuStatus!.textContent =
      error instanceof Error ? error.message : String(error);
  }
}

// The host chooses both explicit backends. Each preview reports its own error;
// missing WebGPU never interrupts WebGL, and no rejected setup goes unhandled.
void Promise.allSettled([
  renderWebGl(canvas, status, shader),
  renderWebGl(mathCanvas, mathStatus, math),
  renderWebGpu(),
]);
