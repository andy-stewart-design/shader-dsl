import type { CompiledFragmentArtifact, ShaderDefaultUniform } from "shdr";
import {
  ShdrRuntimeError,
  type RendererBackend,
  runtimeError,
} from "./errors.js";
import type {
  Renderer,
  RendererOptions,
  ShaderInstallOptions,
  ShaderInstallResult,
} from "./types.js";
import {
  readResourceMetadata,
  UniformState,
  type UniformPatch,
} from "./uniforms.js";

export interface InternalRendererOptions extends RendererOptions {
  readonly uniforms?: UniformPatch;
}

const owners = new WeakSet<HTMLCanvasElement>();
const order: readonly ShaderDefaultUniform[] = ["resolution", "mouse", "time"];

export function claim(
  canvas: HTMLCanvasElement,
  backend: RendererBackend,
): void {
  if (!(canvas instanceof HTMLCanvasElement))
    throw new ShdrRuntimeError(
      backend,
      "surface",
      "Expected a dedicated HTML canvas.",
    );
  if (owners.has(canvas))
    throw new ShdrRuntimeError(
      backend,
      "surface",
      "Canvas already has a Shdr renderer.",
    );
  owners.add(canvas);
}
export function release(canvas: HTMLCanvasElement): void {
  owners.delete(canvas);
}
export function aborted(backend: RendererBackend, signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new ShdrRuntimeError(
      backend,
      "aborted",
      "Renderer creation aborted.",
    );
}
export function checkArtifact(
  value: CompiledFragmentArtifact,
  backend: RendererBackend,
): void {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.glsl !== "string" ||
    typeof value.wgsl !== "string" ||
    !value.defaults ||
    typeof value.defaults !== "object"
  )
    throw new ShdrRuntimeError(
      backend,
      "artifact",
      "Expected a dual-target Shdr artifact.",
    );
  readResourceMetadata(value, backend);
  for (const target of ["glsl", "wgsl"] as const) {
    const entries = value.defaults[target];
    if (
      !Array.isArray(entries) ||
      entries.some((item) => !order.includes(item)) ||
      entries.some(
        (item, index) =>
          index > 0 &&
          order.indexOf(entries[index - 1]!) >= order.indexOf(item),
      )
    )
      throw new ShdrRuntimeError(
        backend,
        "artifact",
        `Invalid ${target} default binding metadata.`,
      );
  }
}
export function epoch(
  value: number | undefined,
  backend: RendererBackend,
): number {
  if (value !== undefined && !Number.isFinite(value))
    throw new ShdrRuntimeError(
      backend,
      "artifact",
      "Invalid shader time origin.",
    );
  return value ?? performance.now();
}

/** Shared canvas input, animation and lifetime; GPU resources stay backend-owned. */
export abstract class CanvasRenderer implements Renderer {
  protected startedAt = performance.now();
  protected generation = 0;
  protected disposed = false;
  protected lost = false;
  protected mouseX = 0;
  protected mouseY = 0;
  protected readonly uniformState: UniformState;
  private frame: number | undefined;
  private drawing = false;
  private failed = false;
  private lastTime = 0;
  private playing: boolean;
  private readonly animate: boolean;
  private readonly onError?: (error: ShdrRuntimeError) => void;

  protected constructor(
    protected readonly canvas: HTMLCanvasElement,
    protected readonly backend: RendererBackend,
    options: RendererOptions,
  ) {
    this.uniformState = new UniformState(backend);
    this.playing = options.playing !== false;
    this.animate = options.animate !== false;
    this.onError = options.onError;
    canvas.addEventListener("pointermove", this.pointerMove);
  }

  abstract setShader(
    artifact: CompiledFragmentArtifact,
    options?: ShaderInstallOptions,
  ): Promise<ShaderInstallResult>;
  protected abstract performDraw(timestamp: number): Promise<number>;
  protected abstract cleanup(): void;

  protected assertUsable(): void {
    if (this.disposed)
      throw new ShdrRuntimeError(
        this.backend,
        "disposed",
        "Renderer has been disposed.",
      );
    if (this.lost)
      throw new ShdrRuntimeError(
        this.backend,
        "lost",
        "Renderer surface was lost.",
      );
  }
  protected current(generation: number): boolean {
    return !this.disposed && !this.lost && generation === this.generation;
  }
  /** Commit a successful visible frame's clock value. */
  protected commitTime(seconds: number): void {
    this.lastTime = Math.max(this.lastTime, seconds, 0);
  }
  /** The time of the last successfully submitted frame. */
  protected committedTime(): number {
    return this.lastTime;
  }
  /** Compute a frame time without advancing the clock. */
  protected elapsed(timestamp: number): number {
    return this.playing
      ? Math.max(this.lastTime, (timestamp - this.startedAt) / 1000, 0)
      : this.lastTime;
  }
  /** Compute the time for a shader-install frame. */
  protected installTime(startedAt: number): number {
    return this.playing
      ? Math.max((performance.now() - startedAt) / 1000, 0)
      : 0;
  }
  protected installed(startedAt: number, seconds: number): void {
    // Every successful replacement starts its shader at the requested origin,
    // including while paused. The playing state itself is not changed.
    this.startedAt = startedAt;
    this.lastTime = Math.max(0, seconds);
    this.failed = false;
    this.schedule();
  }
  protected size(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }
  private pointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / (rect.width || 1)),
    );
    this.mouseY = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / (rect.height || 1)),
    );
  };
  setPointerNormalized(x: number, y: number): void {
    this.assertUsable();
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new ShdrRuntimeError(
        this.backend,
        "artifact",
        "Invalid pointer position.",
      );
    this.mouseX = Math.max(0, Math.min(1, x));
    this.mouseY = Math.max(0, Math.min(1, y));
  }
  setPlaying(playing: boolean): void {
    this.assertUsable();
    if (!playing) {
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      this.frame = undefined;
      this.playing = false;
      return;
    }
    if (!this.playing) {
      // Keep the frozen logical time while excluding the paused wall-clock gap.
      this.startedAt = performance.now() - this.lastTime * 1000;
      this.playing = true;
    }
    this.schedule();
  }
  setUniforms(values: UniformPatch): void {
    this.assertUsable();
    this.uniformState.set(values);
  }
  resetUniforms(...names: readonly string[]): void {
    this.assertUsable();
    this.uniformState.reset(...names);
  }
  cancelPendingShader(): void {
    this.assertUsable();
    this.generation++;
  }
  async draw(): Promise<void> {
    this.assertUsable();
    const timestamp = performance.now();
    try {
      // The backend returns the time it actually submitted. WebGPU resolves
      // this inside its serialized queue, after preceding work has committed.
      const seconds = await this.performDraw(timestamp);
      this.commitTime(seconds);
    } catch (error) {
      throw runtimeError(this.backend, "draw", error);
    }
  }
  private schedule(): void {
    if (
      this.animate &&
      this.playing &&
      !this.failed &&
      !this.disposed &&
      !this.lost &&
      this.frame === undefined &&
      !this.drawing
    )
      this.frame = requestAnimationFrame(this.tick);
  }
  private tick = (): void => {
    this.frame = undefined;
    if (this.disposed || this.lost || this.failed || !this.playing) return;
    this.drawing = true;
    const generation = this.generation;
    void this.draw().then(
      () => {
        this.drawing = false;
        this.schedule();
      },
      (error: unknown) => {
        this.drawing = false;
        if (this.disposed || this.lost) return;
        if (generation !== this.generation) {
          this.schedule();
          return;
        }
        this.failed = true;
        this.notify(runtimeError(this.backend, "draw", error));
      },
    );
  };
  protected asyncFailure(error: ShdrRuntimeError): void {
    if (this.disposed || this.lost || this.failed) return;
    this.failed = true;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.notify(error);
  }
  protected notify(error: ShdrRuntimeError): void {
    try {
      this.onError?.(error);
    } catch {
      /* Host exceptions must not escape GPU events / RAF. */
    }
  }
  protected terminal(message: string): void {
    if (this.disposed || this.lost) return;
    this.lost = true;
    this.generation++;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.notify(new ShdrRuntimeError(this.backend, "lost", message));
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    try {
      this.cleanup();
    } finally {
      release(this.canvas);
    }
  }
}
