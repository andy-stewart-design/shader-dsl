import { ShdrRuntimeError } from "@shdr/runtime/errors";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
import { createWebGpuRenderer } from "@shdr/runtime/webgpu";
import type { Renderer } from "@shdr/runtime/types";
import type { CompiledFragmentArtifact } from "shdr";

import fragmentShader from "./gradient.shdr.ts";
import alternateFragmentShader from "./gradient-alt.shdr.ts";
import expandedShader from "./expanded.shdr.ts";
import mathBuiltinsShader from "./math-builtins.shdr.ts";
import orbitMathShader from "./orbit-math.shdr.ts";
import mixedShapeMathShader from "./mixed-shape-math.shdr.ts";
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
import composedReusable from "./reusable-composed.shdr.ts";
import "./style.css";

const shader: CompiledFragmentArtifact = fragmentShader;
const alternateShader: CompiledFragmentArtifact = alternateFragmentShader;
const expanded: CompiledFragmentArtifact = expandedShader;
const math: CompiledFragmentArtifact = mathBuiltinsShader;
const orbitMath: CompiledFragmentArtifact = orbitMathShader;
const mixedShapeMath: CompiledFragmentArtifact = mixedShapeMathShader;
const cells: CompiledFragmentArtifact = cellsShader;
const pr3Math: CompiledFragmentArtifact = pr3MathShader;
const readableOutput: CompiledFragmentArtifact = readableOutputShader;
const horizonBurn: CompiledFragmentArtifact = horizonBurnShader;
const plasma: CompiledFragmentArtifact = plasmaShader;
const vectorArithmetic: CompiledFragmentArtifact = vectorArithmeticShader;
const composed: CompiledFragmentArtifact = composedReusable;
if (
  customUniformsShader.custom?.declarations[0]?.type !== "vec3" ||
  sharedSchemaA.custom?.declarations[0]?.type !== "f32" ||
  sharedSchemaB.custom?.declarations[0]?.type !== "f32" ||
  composed.custom?.declarations.map((item) => item.name).join(",") !== "gain" ||
  !customUniformsShader.wgsl.includes("@group(1) @binding(0)") ||
  !sharedSchemaA.glsl.includes("uniform float shdr_custom_0") ||
  !sharedSchemaB.glsl.includes("uniform float shdr_custom_0") ||
  !sharedSchemaA.wgsl.includes("@group(1) @binding(0)") ||
  !sharedSchemaB.wgsl.includes("@group(1) @binding(0)") ||
  (composed.glsl.match(/(?:float|vec3) shdr_internal_fn_\d+\s*\(/g) ?? [])
    .length !== 2 ||
  (composed.wgsl.match(/fn shdr_internal_fn_\d+\s*\(/g) ?? []).length !== 2 ||
  !composed.glsl.includes("sqrt") ||
  !composed.wgsl.includes("sqrt")
)
  throw new Error(
    "The custom-uniform artifact was not generated at build time.",
  );
if (
  !expanded.glsl.includes("vec3(") ||
  !shader.wgsl.includes("shdr_fragment_main") ||
  !shader.glsl.includes("vec4 shdr_internal_fn_0") ||
  !shader.wgsl.includes("fn shdr_internal_fn_0") ||
  !alternateShader.glsl.includes("void main()") ||
  !vectorArithmetic.wgsl.includes("vec3<f32>(1.0f)") ||
  !vectorArithmetic.glsl.includes("vec3(") ||
  !cells.wgsl.includes("mix(") ||
  !cells.wgsl.includes("step(") ||
  !pr3Math.glsl.includes("pow(") ||
  !pr3Math.wgsl.includes("shdr_internal_safe_pow_vec3") ||
  !orbitMath.glsl.includes("atan(") ||
  !orbitMath.wgsl.includes("atan2(") ||
  !orbitMath.glsl.includes("shdr_internal_mod_") ||
  !orbitMath.wgsl.includes("shdr_internal_mod_") ||
  !mixedShapeMath.glsl.includes("vec2(") ||
  !mixedShapeMath.wgsl.includes("vec2<f32>(") ||
  !mixedShapeMath.wgsl.includes("shdr_internal_safe_pow_vec4") ||
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
    <canvas id="orbit-canvas" width="128" height="128"></canvas>
    <p id="orbit-status" role="status">Compiling generated orbit shader…</p>
    <canvas id="orbit-gpu-canvas" width="128" height="128"></canvas>
    <p id="orbit-gpu-status" role="status">Starting orbit WebGPU…</p>
    <h2>Composed reusable graph</h2>
    <canvas id="composed-canvas" width="128" height="128"></canvas>
    <p id="composed-status" role="status">Compiling composed shader…</p>
    <canvas id="composed-gpu-canvas" width="128" height="128"></canvas>
    <p id="composed-gpu-status" role="status">Starting composed WebGPU…</p>
    <h2>Custom uniforms (inline and named declarations)</h2>
    <canvas id="custom-gl-canvas" aria-label="Custom uniforms WebGL" width="32" height="32"></canvas>
    <p id="custom-gl-status" role="status">Starting custom WebGL…</p>
    <canvas id="custom-gpu-canvas" aria-label="Custom uniforms WebGPU" width="32" height="32"></canvas>
    <p id="custom-gpu-status" role="status">Starting custom WebGPU…</p>
    <h2>Imported schema isolation</h2>
    <canvas id="shared-a-gl-canvas" aria-label="Shared schema A WebGL" width="32" height="32"></canvas>
    <p id="shared-a-gl-status" role="status">Starting shared schema A WebGL…</p>
    <canvas id="shared-b-gl-canvas" aria-label="Shared schema B WebGL" width="32" height="32"></canvas>
    <p id="shared-b-gl-status" role="status">Starting shared schema B WebGL…</p>
    <canvas id="shared-a-gpu-canvas" aria-label="Shared schema A WebGPU" width="32" height="32"></canvas>
    <p id="shared-a-gpu-status" role="status">Starting shared schema A WebGPU…</p>
    <canvas id="shared-b-gpu-canvas" aria-label="Shared schema B WebGPU" width="32" height="32"></canvas>
    <p id="shared-b-gpu-status" role="status">Starting shared schema B WebGPU…</p>
    <div class="uniform-actions">
      <button id="custom-set" type="button">Set custom uniforms</button>
      <button id="custom-reset-gain" type="button">Reset gain</button>
      <button id="custom-reset-all" type="button">Reset all custom uniforms</button>
      <button id="custom-named" type="button">Use named shader</button>
      <button id="custom-inline" type="button">Use inline shader</button>
      <button id="shared-set-a" type="button">Set shared A gain</button>
      <button id="shared-reset-a" type="button">Reset shared A gain</button>
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
const orbitCanvas = document.querySelector<HTMLCanvasElement>("#orbit-canvas");
const orbitStatus =
  document.querySelector<HTMLParagraphElement>("#orbit-status");
const orbitGpuCanvas =
  document.querySelector<HTMLCanvasElement>("#orbit-gpu-canvas");
const orbitGpuStatus =
  document.querySelector<HTMLParagraphElement>("#orbit-gpu-status");
const composedCanvas =
  document.querySelector<HTMLCanvasElement>("#composed-canvas");
const composedStatus =
  document.querySelector<HTMLParagraphElement>("#composed-status");
const composedGpuCanvas = document.querySelector<HTMLCanvasElement>(
  "#composed-gpu-canvas",
);
const composedGpuStatus = document.querySelector<HTMLParagraphElement>(
  "#composed-gpu-status",
);
if (
  !canvas ||
  !status ||
  !gpuCanvas ||
  !gpuStatus ||
  !mathCanvas ||
  !mathStatus ||
  !orbitCanvas ||
  !orbitStatus ||
  !orbitGpuCanvas ||
  !orbitGpuStatus ||
  !composedCanvas ||
  !composedStatus ||
  !composedGpuCanvas ||
  !composedGpuStatus
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

async function renderOrbitWebGpu(): Promise<void> {
  try {
    const renderer = await createWebGpuRenderer(orbitGpuCanvas!, orbitMath, {
      signal: lifetime.signal,
      animate: false,
      onError(error) {
        orbitGpuCanvas!.dataset.renderStatus = "error";
        orbitGpuStatus!.textContent = error.message;
      },
    });
    renderers.push(renderer);
    orbitGpuCanvas!.dataset.renderStatus = "success";
    orbitGpuStatus!.textContent = "Orbit WGSL rendered in WebGPU.";
  } catch (error) {
    orbitGpuCanvas!.dataset.renderStatus =
      error instanceof ShdrRuntimeError && error.kind === "unavailable"
        ? "unavailable"
        : "error";
    orbitGpuStatus!.textContent =
      error instanceof Error ? error.message : String(error);
  }
}

async function renderComposedWebGpu(): Promise<void> {
  try {
    const renderer = await createWebGpuRenderer(composedGpuCanvas!, composed, {
      signal: lifetime.signal,
      animate: false,
    });
    renderers.push(renderer);
    composedGpuCanvas!.dataset.renderStatus = "success";
    composedGpuStatus!.textContent =
      "Composed WGSL pipelined and rendered in WebGPU.";
  } catch (error) {
    composedGpuCanvas!.dataset.renderStatus =
      error instanceof ShdrRuntimeError && error.kind === "unavailable"
        ? "unavailable"
        : "error";
    composedGpuStatus!.textContent =
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

async function renderSharedSchemaDemos(): Promise<void> {
  const sharedAGlCanvas = document.querySelector<HTMLCanvasElement>(
    "#shared-a-gl-canvas",
  );
  const sharedBGlCanvas = document.querySelector<HTMLCanvasElement>(
    "#shared-b-gl-canvas",
  );
  const sharedAGpuCanvas = document.querySelector<HTMLCanvasElement>(
    "#shared-a-gpu-canvas",
  );
  const sharedBGpuCanvas = document.querySelector<HTMLCanvasElement>(
    "#shared-b-gpu-canvas",
  );
  const sharedAGlStatus = document.querySelector<HTMLParagraphElement>(
    "#shared-a-gl-status",
  );
  const sharedBGlStatus = document.querySelector<HTMLParagraphElement>(
    "#shared-b-gl-status",
  );
  const sharedAGpuStatus = document.querySelector<HTMLParagraphElement>(
    "#shared-a-gpu-status",
  );
  const sharedBGpuStatus = document.querySelector<HTMLParagraphElement>(
    "#shared-b-gpu-status",
  );
  if (
    !sharedAGlCanvas ||
    !sharedBGlCanvas ||
    !sharedAGpuCanvas ||
    !sharedBGpuCanvas ||
    !sharedAGlStatus ||
    !sharedBGlStatus ||
    !sharedAGpuStatus ||
    !sharedBGpuStatus
  )
    throw new Error("Missing shared-schema fixture elements.");

  const sharedA = await createWebGlRenderer(sharedAGlCanvas, sharedSchemaA, {
    signal: lifetime.signal,
    animate: false,
    uniforms: { gain: 0.25 },
  });
  const sharedB = await createWebGlRenderer(sharedBGlCanvas, sharedSchemaB, {
    signal: lifetime.signal,
    animate: false,
    uniforms: { gain: 0.75 },
  });
  renderers.push(sharedA, sharedB);
  sharedAGlCanvas.dataset.renderStatus = "success";
  sharedBGlCanvas.dataset.renderStatus = "success";
  sharedAGlStatus.textContent = "Shared schema A WebGL rendered.";
  sharedBGlStatus.textContent = "Shared schema B WebGL rendered.";

  let sharedAGpuRenderer: Renderer | undefined;
  for (const [canvas, artifact, status, label, uniforms] of [
    [sharedAGpuCanvas, sharedSchemaA, sharedAGpuStatus, "A", { gain: 0.25 }],
    [sharedBGpuCanvas, sharedSchemaB, sharedBGpuStatus, "B", { gain: 0.75 }],
  ] as const) {
    try {
      const renderer = await createWebGpuRenderer(canvas, artifact, {
        signal: lifetime.signal,
        animate: false,
        uniforms,
      });
      if (label === "A") sharedAGpuRenderer = renderer;
      renderers.push(renderer);
      canvas.dataset.renderStatus = "success";
      status.textContent = `Shared schema ${label} WebGPU rendered.`;
    } catch (error) {
      canvas.dataset.renderStatus =
        error instanceof ShdrRuntimeError && error.kind === "unavailable"
          ? "unavailable"
          : "error";
      status.textContent =
        error instanceof Error ? error.message : String(error);
    }
  }

  const allA = [sharedA, ...(sharedAGpuRenderer ? [sharedAGpuRenderer] : [])];
  const action = (
    id: string,
    operation: (renderer: Renderer) => void,
  ): void => {
    document
      .querySelector<HTMLButtonElement>(`#${id}`)
      ?.addEventListener("click", () => {
        for (const renderer of allA) {
          operation(renderer);
          void renderer.draw();
        }
      });
  };
  action("shared-set-a", (renderer) => renderer.setUniforms({ gain: 1 }));
  action("shared-reset-a", (renderer) => renderer.resetUniforms("gain"));
}

// The host chooses both explicit backends. Each preview reports its own error;
// missing WebGPU never interrupts WebGL, and no rejected setup goes unhandled.
void Promise.allSettled([
  renderWebGl(canvas, status, shader),
  renderWebGl(mathCanvas, mathStatus, math),
  renderWebGl(orbitCanvas, orbitStatus, orbitMath),
  renderWebGl(composedCanvas, composedStatus, composed),
  renderWebGpu(),
  renderOrbitWebGpu(),
  renderComposedWebGpu(),
  renderCustomUniformDemos(),
  renderSharedSchemaDemos(),
]);
