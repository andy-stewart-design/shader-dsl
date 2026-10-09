import { ShdrRuntimeError } from "@shdr/runtime/errors";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
import { createWebGpuRenderer } from "@shdr/runtime/webgpu";
import type { Renderer } from "@shdr/runtime/types";
import type { CompiledFragmentArtifact } from "shdr";

import fragmentShader from "./gradient.shdr.ts";
import alternateFragmentShader from "./gradient-alt.shdr.ts";
import expandedShader from "./expanded.shdr.ts";
import mathBuiltinsShader from "./math-builtins.shdr.ts";
import cellsShader from "./cells-representative.shdr.ts";
import pr3MathShader from "./pr3-math.shdr.ts";
import readableOutputShader from "./readable-output.shdr.ts";
import horizonBurnShader from "./references/horizon-burn.shdr.ts";
import plasmaShader from "./references/plasma.shdr.ts";
import vectorArithmeticShader from "./vector-arithmetic.shdr.ts";
import customUniformsShader from "./custom-uniforms.shdr.ts";
import customInline from "./custom-demo-inline.shdr.ts";
import customNamed from "./custom-demo-named.shdr.ts";
import sharedSchemaA from "./custom-shared-a.shdr.ts";
import sharedSchemaB from "./custom-shared-b.shdr.ts";
import "./style.css";

const shader: CompiledFragmentArtifact = fragmentShader;
const alternateShader: CompiledFragmentArtifact = alternateFragmentShader;
const expanded: CompiledFragmentArtifact = expandedShader;
const math: CompiledFragmentArtifact = mathBuiltinsShader;
const cells: CompiledFragmentArtifact = cellsShader;
const pr3Math: CompiledFragmentArtifact = pr3MathShader;
const readableOutput: CompiledFragmentArtifact = readableOutputShader;
const horizonBurn: CompiledFragmentArtifact = horizonBurnShader;
const plasma: CompiledFragmentArtifact = plasmaShader;
const vectorArithmetic: CompiledFragmentArtifact = vectorArithmeticShader;
if (
  customUniformsShader.custom?.declarations[0]?.type !== "vec3" ||
  sharedSchemaA.custom?.declarations[0]?.type !== "f32" ||
  sharedSchemaB.custom?.declarations[0]?.type !== "f32" ||
  !customUniformsShader.wgsl.includes("@group(1) @binding(0)")
)
  throw new Error(
    "The custom-uniform artifact was not generated at build time.",
  );
if (
  !expanded.glsl.includes("vec3(") ||
  !shader.wgsl.includes("shdr_fragment_main") ||
  !alternateShader.glsl.includes("void main()") ||
  !vectorArithmetic.wgsl.includes("vec3<f32>(1.0f)") ||
  !vectorArithmetic.glsl.includes("vec3(") ||
  !cells.wgsl.includes("mix(") ||
  !cells.wgsl.includes("step(") ||
  !pr3Math.glsl.includes("pow(") ||
  !pr3Math.wgsl.includes("shdr_internal_safe_pow_vec3") ||
  !readableOutput.glsl.includes(
    "vec2 inputMouse = vec2(u_mouse.x, u_resolution.y - u_mouse.y)",
  ) ||
  !readableOutput.wgsl.includes("let shdr_local_3: f32 = shdr_local_2;") ||
  !readableOutput.wgsl.includes("a + (b + shdr_local_3 * 0.1f)") ||
  !horizonBurn.glsl.includes("fract(") ||
  !horizonBurn.wgsl.includes("shdr_fragment_main") ||
  !plasma.wgsl.includes("shdr_internal_safe_sqrt_f32") ||
  plasma.custom?.declarations.map((item) => item.name).join(",") !==
    "scale,speed,complexity,grain,colorA,colorB" ||
  cells.custom?.declarations.map((item) => item.name).join(",") !==
    "dpi,spread,blur"
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
    <h2>Custom uniforms (inline and named declarations)</h2>
    <canvas id="custom-gl-canvas" aria-label="Custom uniforms WebGL" width="32" height="32"></canvas>
    <p id="custom-gl-status" role="status">Starting custom WebGL…</p>
    <canvas id="custom-gpu-canvas" aria-label="Custom uniforms WebGPU" width="32" height="32"></canvas>
    <p id="custom-gpu-status" role="status">Starting custom WebGPU…</p>
    <div class="uniform-actions">
      <button id="custom-set" type="button">Set custom uniforms</button>
      <button id="custom-reset-gain" type="button">Reset gain</button>
      <button id="custom-reset-all" type="button">Reset all custom uniforms</button>
      <button id="custom-named" type="button">Use named shader</button>
      <button id="custom-inline" type="button">Use inline shader</button>
    </div>
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

async function renderCustomUniformDemos(): Promise<void> {
  const glCanvas =
    document.querySelector<HTMLCanvasElement>("#custom-gl-canvas");
  const gpuCanvas =
    document.querySelector<HTMLCanvasElement>("#custom-gpu-canvas");
  const glStatus =
    document.querySelector<HTMLParagraphElement>("#custom-gl-status");
  const gpuStatus =
    document.querySelector<HTMLParagraphElement>("#custom-gpu-status");
  if (!glCanvas || !gpuCanvas || !glStatus || !gpuStatus)
    throw new Error("Missing custom-uniform fixture elements.");
  const gl = await createWebGlRenderer(glCanvas, customInline, {
    signal: lifetime.signal,
    animate: false,
    uniforms: { color: [0.1, 0.3, 0.5], gain: 0.2 },
    onError(error) {
      glStatus.textContent = error.message;
    },
  }).catch((error: unknown): never => {
    glCanvas.dataset.renderStatus = "error";
    glStatus.textContent =
      error instanceof Error ? error.message : String(error);
    throw error;
  });
  renderers.push(gl);
  glCanvas.dataset.renderStatus = "success";
  glStatus.textContent =
    "Custom GLSL first frame rendered with instance overrides.";
  const gpu = await createWebGpuRenderer(gpuCanvas, customInline, {
    signal: lifetime.signal,
    animate: false,
    uniforms: { color: [0.1, 0.3, 0.5], gain: 0.2 },
    onError(error) {
      gpuStatus.textContent = error.message;
    },
  }).then(
    (renderer) => {
      renderers.push(renderer);
      gpuCanvas.dataset.renderStatus = "success";
      gpuStatus.textContent =
        "Custom WGSL first frame rendered with instance overrides.";
      return renderer;
    },
    (error: unknown) => {
      gpuCanvas.dataset.renderStatus =
        error instanceof ShdrRuntimeError && error.kind === "unavailable"
          ? "unavailable"
          : "error";
      gpuStatus.textContent =
        error instanceof Error ? error.message : String(error);
      return null;
    },
  );
  const both = gpu ? [gl, gpu] : [gl];
  function action(
    id: string,
    operation: (renderer: typeof gl) => Promise<void>,
  ): void {
    document
      .querySelector<HTMLButtonElement>(`#${id}`)
      ?.addEventListener("click", () => {
        void Promise.all(both.map(operation)).catch((error: unknown) => {
          glStatus.textContent =
            error instanceof Error ? error.message : String(error);
        });
      });
  }
  action("custom-set", async (renderer) => {
    renderer.setUniforms({ color: [0.7, 0.2, 0.3], gain: 0.8 });
    await renderer.draw();
  });
  action("custom-reset-gain", async (renderer) => {
    renderer.resetUniforms("gain");
    await renderer.draw();
  });
  action("custom-reset-all", async (renderer) => {
    renderer.resetUniforms();
    await renderer.draw();
  });
  action("custom-named", async (renderer) => {
    await renderer.setShader(customNamed);
  });
  action("custom-inline", async (renderer) => {
    await renderer.setShader(customInline);
  });
}

// The host chooses both explicit backends. Each preview reports its own error;
// missing WebGPU never interrupts WebGL, and no rejected setup goes unhandled.
void Promise.allSettled([
  renderWebGl(canvas, status, shader),
  renderWebGl(mathCanvas, mathStatus, math),
  renderWebGpu(),
  renderCustomUniformDemos(),
]);
