const FULLSCREEN_TRIANGLE_VERTEX_SHADER = `@vertex
fn shdr_fullscreen_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let vertices = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  return vec4<f32>(vertices[index], 0.0, 1.0);
}`;

const DEFAULT_UNIFORMS = [
  { name: "resolution", binding: 0, type: "vec2<f32>", bytes: 8 },
  { name: "mouse", binding: 1, type: "vec2<f32>", bytes: 8 },
  { name: "time", binding: 2, type: "f32", bytes: 4 },
] as const;

type DefaultUniform = (typeof DEFAULT_UNIFORMS)[number]["name"];

interface ShaderResources {
  readonly pipeline: GPURenderPipeline;
  readonly buffers: ReadonlyMap<DefaultUniform, GPUBuffer>;
  readonly bindGroup?: GPUBindGroup;
  readonly boundUniforms: readonly DefaultUniform[];
  readonly warnings: readonly string[];
}

export class WebGpuUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGpuUnavailableError";
  }
}

/** REPL-local renderer. A superseded compilation resolves to undefined. */
export class WebGpuRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: GPUCanvasContext;
  readonly #device: GPUDevice;
  readonly #format: GPUTextureFormat;
  readonly #vertex: GPUShaderModule;
  readonly #onError?: (message: string) => void;
  #resources?: ShaderResources;
  #shaderStartedAt = performance.now();
  #frame?: number;
  #generation = 0;
  // WebGPU error scopes belong to the device, not a Promise. Serialize
  // preparation so concurrent source edits cannot pop one another's scopes.
  #compilations: Promise<void> = Promise.resolve();
  #mouseX = 0;
  #mouseY = 0;
  #disposed = false;
  #lost = false;
  #drawingFailed = false;

  private constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    format: GPUTextureFormat,
    onError?: (message: string) => void,
  ) {
    this.#canvas = canvas;
    this.#context = context;
    this.#device = device;
    this.#format = format;
    this.#vertex = device.createShaderModule({
      code: FULLSCREEN_TRIANGLE_VERTEX_SHADER,
    });
    this.#onError = onError;
    canvas.dataset.renderStatus = "pending";
    canvas.dataset.validationState = "pending";
    void device.lost.then((info) => {
      if (this.#disposed || this.#lost) return;
      this.#lost = true;
      this.#generation++;
      if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
      if (this.#resources) destroyResources(this.#resources);
      this.#resources = undefined;
      this.#context.unconfigure();
      canvas.dataset.renderStatus = "error";
      canvas.dataset.validationState = "error";
      this.#onError?.(`WebGPU device lost: ${info.message || info.reason}`);
    });
    device.addEventListener("uncapturederror", this.#uncapturedError);
    this.#frame = requestAnimationFrame(this.#drawFrame);
  }

  static async create(
    canvas: HTMLCanvasElement,
    onError?: (message: string) => void,
  ): Promise<WebGpuRenderer> {
    if (!navigator.gpu)
      throw new WebGpuUnavailableError(
        "WebGPU is unavailable in this browser.",
      );
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
      throw new WebGpuUnavailableError("WebGPU exposed no adapter.");
    let device: GPUDevice;
    try {
      device = await adapter.requestDevice();
    } catch (error) {
      throw new WebGpuUnavailableError(
        `WebGPU device request failed: ${errorMessage(error)}`,
      );
    }
    try {
      const context = canvas.getContext("webgpu");
      if (!context)
        throw new WebGpuUnavailableError("WebGPU canvas context unavailable.");
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format,
        alphaMode: "opaque",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      return new WebGpuRenderer(canvas, context, device, format, onError);
    } catch (error) {
      device.destroy();
      throw error;
    }
  }

  setFragmentShader(
    source: string,
  ): Promise<readonly DefaultUniform[] | undefined> {
    this.#assertUsable();
    const generation = ++this.#generation;
    const result = this.#compilations.then(() =>
      this.#installFragmentShader(source, generation),
    );
    this.#compilations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #installFragmentShader(
    source: string,
    generation: number,
  ): Promise<readonly DefaultUniform[] | undefined> {
    if (!this.#isCurrent(generation)) return undefined;
    let candidate: ShaderResources | undefined;
    try {
      candidate = await this.#prepare(source, generation);
      if (!candidate || !this.#isCurrent(generation)) return undefined;
      this.#resizeDrawingBuffer();
      const startedAt = performance.now();
      // A failed candidate draw must not clear the last successful canvas frame.
      const preflight = this.#device.createTexture({
        size: [this.#canvas.width, this.#canvas.height],
        format: this.#format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      try {
        this.#device.pushErrorScope("validation");
        let failure: unknown;
        try {
          this.#submitDraw(
            candidate,
            preflight.createView(),
            startedAt,
            startedAt,
          );
        } catch (error) {
          failure = error;
        }
        const scoped = await this.#device.popErrorScope();
        if (failure || scoped)
          throw new Error(
            `WebGPU draw failed: ${scoped?.message ?? errorMessage(failure)}`,
          );
      } finally {
        preflight.destroy();
      }
      if (!this.#isCurrent(generation)) return undefined;
      // The check, submit and commit are synchronous: a later compile cannot
      // slip between them and let this older result draw over its replacement.
      this.#submitDraw(
        candidate,
        this.#context.getCurrentTexture().createView(),
        startedAt,
        startedAt,
      );
      const previous = this.#resources;
      this.#resources = candidate;
      this.#shaderStartedAt = startedAt;
      candidate = undefined;
      if (previous) destroyResources(previous);
      this.#canvas.dataset.renderStatus = "success";
      this.#canvas.dataset.validationState = "success";
      this.#drawingFailed = false;
      if (this.#frame === undefined)
        this.#frame = requestAnimationFrame(this.#drawFrame);
      this.#canvas.dataset.boundUniforms =
        this.#resources.boundUniforms.join(",");
      return this.#resources.boundUniforms;
    } catch (error) {
      if (!this.#isCurrent(generation)) return undefined;
      this.#canvas.dataset.validationState = "error";
      if (!this.#resources) this.#canvas.dataset.renderStatus = "error";
      throw error;
    } finally {
      if (candidate) destroyResources(candidate);
    }
  }

  get warnings(): readonly string[] {
    return this.#resources?.warnings ?? [];
  }

  setMouse(x: number, y: number): void {
    this.#mouseX = x;
    this.#mouseY = y;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation++;
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
    this.#device.removeEventListener("uncapturederror", this.#uncapturedError);
    if (this.#resources) destroyResources(this.#resources);
    this.#resources = undefined;
    this.#context.unconfigure();
    this.#device.destroy();
  }

  async #prepare(
    source: string,
    generation: number,
  ): Promise<ShaderResources | undefined> {
    const active = DEFAULT_UNIFORMS.filter(({ name, binding, type }) =>
      source.includes(
        `@group(0) @binding(${binding}) var<uniform> shdr_${name}: ${type};`,
      ),
    );
    // This class accepts generated Shdr WGSL only, with the three fixed
    // bindings. Fail closed rather than silently omitting an unexpected one.
    const declared =
      source.match(/@group\(\d+\)\s+@binding\(\d+\)\s+var<uniform>/g) ?? [];
    if (declared.length !== active.length)
      throw new Error("Unsupported generated WGSL uniform declaration.");

    this.#device.pushErrorScope("validation");
    const module = this.#device.createShaderModule({ code: source });
    const info = await module.getCompilationInfo();
    const moduleError = await this.#device.popErrorScope();
    const errors = info.messages.filter((message) => message.type === "error");
    if (errors.length || moduleError) {
      throw new Error(
        `WGSL module compilation failed: ${[
          ...errors.map(
            (message) =>
              `${message.lineNum}:${message.linePos}: ${message.message}`,
          ),
          ...(moduleError ? [moduleError.message] : []),
        ].join("\n")}`,
      );
    }
    if (!this.#isCurrent(generation)) return undefined;

    this.#device.pushErrorScope("validation");
    let pipeline: GPURenderPipeline | undefined;
    let failure: unknown;
    try {
      pipeline = await this.#device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module: this.#vertex, entryPoint: "shdr_fullscreen_vertex" },
        fragment: {
          module,
          entryPoint: "shdr_fragment_main",
          targets: [{ format: this.#format }],
        },
        primitive: { topology: "triangle-list" },
      });
    } catch (error) {
      failure = error;
    }
    const pipelineError = await this.#device.popErrorScope();
    if (!pipeline || pipelineError) {
      throw new Error(
        `WGSL pipeline creation failed: ${pipelineError?.message ?? errorMessage(failure)}`,
      );
    }
    if (!this.#isCurrent(generation)) return undefined;

    const buffers = new Map<DefaultUniform, GPUBuffer>();
    this.#device.pushErrorScope("validation");
    let bindGroup: GPUBindGroup | undefined;
    let bindingFailure: unknown;
    try {
      for (const uniform of active) {
        buffers.set(
          uniform.name,
          this.#device.createBuffer({
            size: uniform.bytes,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          }),
        );
      }
      if (active.length) {
        bindGroup = this.#device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: active.map(({ name, binding }) => ({
            binding,
            resource: { buffer: buffers.get(name)! },
          })),
        });
      }
    } catch (error) {
      bindingFailure = error;
    }
    const bindingError = await this.#device.popErrorScope();
    if (bindingFailure || bindingError) {
      for (const buffer of buffers.values()) buffer.destroy();
      throw new Error(
        `WGSL uniform binding failed: ${bindingError?.message ?? errorMessage(bindingFailure)}`,
      );
    }
    if (!this.#isCurrent(generation)) {
      for (const buffer of buffers.values()) buffer.destroy();
      return undefined;
    }
    return {
      pipeline,
      buffers,
      bindGroup,
      boundUniforms: active.map(({ name }) => name),
      warnings: info.messages
        .filter((message) => message.type === "warning")
        .map(
          (message) =>
            `${message.lineNum}:${message.linePos}: ${message.message}`,
        ),
    };
  }

  #submitDraw(
    resources: ShaderResources,
    view: GPUTextureView,
    timestamp: number,
    startedAt: number,
  ): void {
    this.#writeUniforms(resources, timestamp, startedAt);
    const encoder = this.#device.createCommandEncoder();
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
    this.#device.queue.submit([encoder.finish()]);
  }

  #writeUniforms(
    resources: ShaderResources,
    timestamp: number,
    startedAt: number,
  ): void {
    const { buffers } = resources;
    const resolution = buffers.get("resolution");
    if (resolution)
      this.#device.queue.writeBuffer(
        resolution,
        0,
        new Float32Array([this.#canvas.width, this.#canvas.height]),
      );
    const mouse = buffers.get("mouse");
    if (mouse)
      this.#device.queue.writeBuffer(
        mouse,
        0,
        new Float32Array([this.#mouseX, this.#mouseY]),
      );
    const time = buffers.get("time");
    if (time)
      this.#device.queue.writeBuffer(
        time,
        0,
        new Float32Array([(timestamp - startedAt) / 1_000]),
      );
  }

  #resizeDrawingBuffer(): void {
    const rect = this.#canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
    this.#canvas.dataset.resolution = `${this.#canvas.width},${this.#canvas.height}`;
  }

  #drawFrame = (timestamp: number): void => {
    this.#frame = undefined;
    if (this.#disposed || this.#lost || this.#drawingFailed) return;
    if (this.#resources) {
      try {
        this.#resizeDrawingBuffer();
        this.#submitDraw(
          this.#resources,
          this.#context.getCurrentTexture().createView(),
          timestamp,
          this.#shaderStartedAt,
        );
        this.#canvas.dataset.mouse = `${this.#mouseX},${this.#mouseY}`;
        this.#canvas.dataset.time = String(
          (timestamp - this.#shaderStartedAt) / 1_000,
        );
      } catch (error) {
        this.#drawingFailed = true;
        this.#canvas.dataset.validationState = "error";
        this.#onError?.(`WebGPU render failed: ${errorMessage(error)}`);
        return;
      }
    }
    this.#frame = requestAnimationFrame(this.#drawFrame);
  };

  #uncapturedError = (event: GPUUncapturedErrorEvent): void => {
    this.#drawingFailed = true;
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
    this.#canvas.dataset.validationState = "error";
    this.#onError?.(`WebGPU validation failed: ${event.error.message}`);
  };

  #assertUsable(): void {
    if (this.#disposed) throw new Error("WebGPU renderer has been disposed.");
    if (this.#lost) throw new Error("WebGPU device was lost.");
  }

  #isCurrent(generation: number): boolean {
    return !this.#disposed && !this.#lost && generation === this.#generation;
  }
}

function destroyResources(resources: ShaderResources): void {
  for (const buffer of resources.buffers.values()) buffer.destroy();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
