/// <reference types="@webgpu/types" />
import type { CompiledFragmentArtifact, ShaderDefaultUniform } from "shdr";
import { ShdrRuntimeError, runtimeError } from "./errors.js";
import {
  aborted,
  CanvasRenderer,
  checkArtifact,
  claim,
  epoch,
  release,
} from "./shared.js";
import type {
  RendererOptions,
  ShaderInstallOptions,
  ShaderInstallResult,
} from "./types.js";

const VERTEX = `@vertex
fn shdr_fullscreen_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let vertices = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(vertices[index], 0.0, 1.0);
}`;
const defaults = [
  { name: "resolution", binding: 0, bytes: 8 },
  { name: "mouse", binding: 1, bytes: 8 },
  { name: "time", binding: 2, bytes: 4 },
] as const;
interface Resources {
  readonly pipeline: GPURenderPipeline;
  readonly buffers: ReadonlyMap<ShaderDefaultUniform, GPUBuffer>;
  readonly bindGroup?: GPUBindGroup;
  readonly boundUniforms: readonly ShaderDefaultUniform[];
  readonly warnings: readonly string[];
}
function destroy(resource: Resources): void {
  for (const buffer of resource.buffers.values()) buffer.destroy();
}

export class WebGpuRenderer extends CanvasRenderer {
  private resources?: Resources;
  private readonly vertex: GPUShaderModule;
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly device: GPUDevice;
  // Error scopes belong to the device, not a Promise. Serialize every scoped
  // preparation and draw, including RAF/manual draws and replacement installs.
  private serial: Promise<void> = Promise.resolve();
  private constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    format: GPUTextureFormat,
    vertex: GPUShaderModule,
    options: RendererOptions,
  ) {
    super(canvas, "webgpu", options);
    this.context = context;
    this.device = device;
    this.format = format;
    this.vertex = vertex;
    device.addEventListener("uncapturederror", this.uncaptured);
    void device.lost.then((info) => {
      if (this.disposed || this.lost) return;
      this.terminal(`WebGPU device lost: ${info.message || info.reason}`);
      if (this.resources) destroy(this.resources);
      this.resources = undefined;
      context.unconfigure();
    });
  }
  static async create(
    canvas: HTMLCanvasElement,
    artifact: CompiledFragmentArtifact,
    options: RendererOptions = {},
  ): Promise<WebGpuRenderer> {
    aborted("webgpu", options.signal);
    claim(canvas, "webgpu");
    let device: GPUDevice | undefined;
    let context: GPUCanvasContext | null = null;
    let renderer: WebGpuRenderer | undefined;
    try {
      checkArtifact(artifact, "webgpu");
      if (!navigator.gpu)
        throw new ShdrRuntimeError(
          "webgpu",
          "unavailable",
          "WebGPU unavailable.",
        );
      const adapter = await navigator.gpu.requestAdapter();
      aborted("webgpu", options.signal);
      if (!adapter)
        throw new ShdrRuntimeError(
          "webgpu",
          "unavailable",
          "No WebGPU adapter.",
        );
      try {
        device = await adapter.requestDevice();
      } catch (error) {
        throw runtimeError("webgpu", "unavailable", error);
      }
      aborted("webgpu", options.signal);
      context = canvas.getContext("webgpu");
      if (!context)
        throw new ShdrRuntimeError(
          "webgpu",
          "unavailable",
          "WebGPU canvas context unavailable.",
        );
      const format = navigator.gpu.getPreferredCanvasFormat();
      try {
        context.configure({
          device,
          format,
          alphaMode: "opaque",
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
      } catch (error) {
        throw runtimeError("webgpu", "surface", error);
      }
      const vertex = device.createShaderModule({ code: VERTEX });
      renderer = new WebGpuRenderer(
        canvas,
        context,
        device,
        format,
        vertex,
        options,
      );
      const abort = () => renderer?.dispose();
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        aborted("webgpu", options.signal);
        const installed = await renderer.setShader(artifact, {
          startedAt: options.startedAt,
        });
        aborted("webgpu", options.signal);
        if (installed.status !== "installed")
          throw new ShdrRuntimeError(
            "webgpu",
            "lost",
            "WebGPU surface invalidated during creation.",
          );
      } finally {
        options.signal?.removeEventListener("abort", abort);
      }
      return renderer;
    } catch (error) {
      renderer?.dispose();
      if (!renderer) {
        try {
          context?.unconfigure();
        } catch {
          /* Configuration itself may have failed. */
        }
        device?.destroy();
        release(canvas);
      }
      if (options.signal?.aborted) aborted("webgpu", options.signal);
      throw runtimeError("webgpu", "shader", error);
    }
  }
  private uncaptured = (event: GPUUncapturedErrorEvent): void => {
    this.asyncFailure(
      new ShdrRuntimeError(
        "webgpu",
        "draw",
        `WebGPU uncaptured error: ${event.error.message}`,
        { cause: event.error },
      ),
    );
  };
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.serial.then(job);
    this.serial = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  setShader(
    artifact: CompiledFragmentArtifact,
    options: ShaderInstallOptions = {},
  ): Promise<ShaderInstallResult> {
    try {
      this.assertUsable();
      const generation = ++this.generation;
      checkArtifact(artifact, "webgpu");
      return this.enqueue(() => this.install(artifact, generation, options));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private async install(
    artifact: CompiledFragmentArtifact,
    generation: number,
    options: ShaderInstallOptions,
  ): Promise<ShaderInstallResult> {
    if (!this.current(generation)) return { status: "superseded" };
    let candidate: Resources | undefined;
    try {
      candidate = await this.prepare(artifact);
      if (!this.current(generation)) return { status: "superseded" };
      this.size();
      const requestedEpoch =
        options.startedAt === undefined
          ? undefined
          : epoch(options.startedAt, "webgpu");
      // Preflight against an offscreen target: a failed draw does not clear the
      // previously presented canvas. Validation is scoped, not module-only.
      const texture = this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      try {
        await this.scoped("draw", () =>
          this.submit(
            candidate!,
            texture.createView(),
            requestedEpoch === undefined
              ? 0
              : Math.max(0, (performance.now() - requestedEpoch) / 1000),
          ),
        );
      } finally {
        texture.destroy();
      }
      if (!this.current(generation)) return { status: "superseded" };
      const startedAt = requestedEpoch ?? performance.now();
      await this.scoped("draw", () =>
        this.submit(
          candidate!,
          this.context.getCurrentTexture().createView(),
          Math.max(0, (performance.now() - startedAt) / 1000),
        ),
      );
      if (!this.current(generation)) return { status: "superseded" };
      const previous = this.resources;
      this.resources = candidate;
      candidate = undefined;
      if (previous) destroy(previous);
      this.installed(startedAt);
      return {
        status: "installed",
        boundUniforms: this.resources.boundUniforms,
        warnings: this.resources.warnings,
      };
    } catch (error) {
      if (!this.current(generation)) return { status: "superseded" };
      throw runtimeError("webgpu", "shader", error);
    } finally {
      if (candidate) destroy(candidate);
    }
  }
  private async scoped(
    kind: "shader" | "draw",
    action: () => void | Promise<void>,
  ): Promise<void> {
    this.device.pushErrorScope("validation");
    let failure: unknown;
    try {
      await action();
    } catch (error) {
      failure = error;
    }
    const scoped = await this.device.popErrorScope();
    if (failure || scoped)
      throw new ShdrRuntimeError(
        "webgpu",
        kind,
        scoped?.message ?? String(failure),
        { cause: scoped ?? failure },
      );
  }
  private async prepare(
    artifact: CompiledFragmentArtifact,
  ): Promise<Resources> {
    const active = defaults.filter(({ name }) =>
      artifact.defaults.wgsl.includes(name),
    );
    let module: GPUShaderModule | undefined;
    let info: GPUCompilationInfo | undefined;
    await this.scoped("shader", async () => {
      module = this.device.createShaderModule({ code: artifact.wgsl });
      info = await module.getCompilationInfo();
    });
    const errors = info!.messages.filter((message) => message.type === "error");
    if (errors.length)
      throw new ShdrRuntimeError(
        "webgpu",
        "shader",
        `WGSL module compilation failed: ${errors.map((message) => `${message.lineNum}:${message.linePos}: ${message.message}`).join("\n")}`,
      );
    let pipeline: GPURenderPipeline | undefined;
    try {
      await this.scoped("shader", async () => {
        pipeline = await this.device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: this.vertex, entryPoint: "shdr_fullscreen_vertex" },
          fragment: {
            module: module!,
            entryPoint: "shdr_fragment_main",
            targets: [{ format: this.format }],
          },
          primitive: { topology: "triangle-list" },
        });
      });
    } catch (error) {
      throw new ShdrRuntimeError(
        "webgpu",
        "shader",
        `WGSL pipeline creation failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    const buffers = new Map<ShaderDefaultUniform, GPUBuffer>();
    let bindGroup: GPUBindGroup | undefined;
    try {
      await this.scoped("shader", () => {
        for (const uniform of active)
          buffers.set(
            uniform.name,
            this.device.createBuffer({
              size: uniform.bytes,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            }),
          );
        if (active.length)
          bindGroup = this.device.createBindGroup({
            layout: pipeline!.getBindGroupLayout(0),
            entries: active.map(({ name, binding }) => ({
              binding,
              resource: { buffer: buffers.get(name)! },
            })),
          });
      });
    } catch (error) {
      for (const buffer of buffers.values()) buffer.destroy();
      throw error;
    }
    return {
      pipeline: pipeline!,
      buffers,
      bindGroup,
      boundUniforms: active.map(({ name }) => name),
      warnings: info!.messages
        .filter((message) => message.type === "warning")
        .map(
          (message) =>
            `${message.lineNum}:${message.linePos}: ${message.message}`,
        ),
    };
  }
  protected performDraw(timestamp: number): Promise<void> {
    return this.enqueue(async () => {
      this.assertUsable();
      if (!this.resources)
        throw new ShdrRuntimeError(
          "webgpu",
          "draw",
          "No installed WebGPU shader.",
        );
      this.size();
      await this.scoped("draw", () =>
        this.submit(
          this.resources!,
          this.context.getCurrentTexture().createView(),
          this.elapsed(timestamp),
        ),
      );
    });
  }
  private submit(
    resources: Resources,
    view: GPUTextureView,
    seconds: number,
  ): void {
    const { buffers } = resources;
    const resolution = buffers.get("resolution");
    if (resolution)
      this.device.queue.writeBuffer(
        resolution,
        0,
        new Float32Array([this.canvas.width, this.canvas.height]),
      );
    const mouse = buffers.get("mouse");
    if (mouse)
      this.device.queue.writeBuffer(
        mouse,
        0,
        new Float32Array([
          this.mouseX * this.canvas.width,
          this.mouseY * this.canvas.height,
        ]),
      );
    const time = buffers.get("time");
    if (time)
      this.device.queue.writeBuffer(time, 0, new Float32Array([seconds]));
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(resources.pipeline);
    if (resources.bindGroup) pass.setBindGroup(0, resources.bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
  protected cleanup(): void {
    this.device.removeEventListener("uncapturederror", this.uncaptured);
    if (this.resources) destroy(this.resources);
    this.resources = undefined;
    this.context.unconfigure();
    this.device.destroy();
  }
}
export async function createWebGpuRenderer(
  canvas: HTMLCanvasElement,
  artifact: CompiledFragmentArtifact,
  options?: RendererOptions,
): Promise<WebGpuRenderer> {
  return WebGpuRenderer.create(canvas, artifact, options);
}
