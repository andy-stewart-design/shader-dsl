import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasRenderer } from "../src/shared.js";
import type {
  RendererOptions,
  ShaderInstallOptions,
  ShaderInstallResult,
} from "../src/types.js";
import type { CompiledFragmentArtifact } from "shdr";

class FakeCanvas {
  width = 1;
  height = 1;
  addEventListener(): void {}
  removeEventListener(): void {}
  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 10, height: 10 } as DOMRect;
  }
}

class TestRenderer extends CanvasRenderer {
  readonly times: number[] = [];
  private releaseBlockedDraw?: () => void;
  private blocked = false;
  private readonly serialized: boolean;
  private serial = Promise.resolve();

  constructor(options: RendererOptions = {}, serialized = false) {
    super(new FakeCanvas() as unknown as HTMLCanvasElement, "webgl", options);
    this.serialized = serialized;
  }

  async setShader(
    _artifact: CompiledFragmentArtifact,
    _options?: ShaderInstallOptions,
  ): Promise<ShaderInstallResult> {
    return { status: "installed", boundUniforms: [], warnings: [] };
  }

  install(startedAt: number): void {
    const seconds = this.installTime(startedAt);
    this.installed(startedAt, seconds);
  }

  candidateTime(startedAt: number): number {
    return this.installTime(startedAt);
  }

  blockNextDraw(): void {
    this.blocked = true;
  }

  releaseDraw(): void {
    this.releaseBlockedDraw?.();
    this.releaseBlockedDraw = undefined;
  }

  protected performDraw(timestamp: number): Promise<number> {
    const run = async (): Promise<number> => {
      const seconds = this.elapsed(
        this.serialized ? performance.now() : timestamp,
      );
      if (this.blocked) {
        this.blocked = false;
        await new Promise<void>((resolve) => {
          this.releaseBlockedDraw = resolve;
        });
      }
      this.times.push(seconds);
      return seconds;
    };
    if (!this.serialized) return run();
    const result = this.serial.then(run);
    this.serial = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  protected cleanup(): void {}
}

const raf = new Map<number, FrameRequestCallback>();
let nextRaf = 1;

function runRaf(timestamp: number): void {
  const entries = [...raf.entries()];
  raf.clear();
  for (const [, callback] of entries) callback(timestamp);
}

async function settled(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("CanvasRenderer playing clock", () => {
  let now = 1000;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    now = 1000;
  });

  afterEach(() => {
    nowSpy.mockRestore();
    vi.restoreAllMocks();
    raf.clear();
    nextRaf = 1;
  });

  it("freezes ordinary pause/resume without a wall-clock jump", async () => {
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
    const renderer = new TestRenderer({ animate: false });
    renderer.install(1000);

    now = 21_000;
    await renderer.draw();
    expect(renderer.times.at(-1)).toBeCloseTo(20);
    renderer.setPlaying(false);
    now = 50_000;
    await renderer.draw();
    expect(renderer.times.at(-1)).toBeCloseTo(20);

    renderer.setPlaying(true);
    now = 50_250;
    await renderer.draw();
    expect(renderer.times.at(-1)).toBeCloseTo(20.25);
  });

  it("freezes at the submitted in-flight frame rather than the pause event", async () => {
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
    const renderer = new TestRenderer({ animate: false });
    renderer.install(1000);
    renderer.blockNextDraw();

    now = 1100;
    const draw = renderer.draw();
    now = 1200;
    renderer.setPlaying(false);
    now = 1300;
    renderer.releaseDraw();
    await draw;
    expect(renderer.times.at(-1)).toBeCloseTo(0.1);

    now = 10_000;
    await renderer.draw();
    expect(renderer.times.at(-1)).toBeCloseTo(0.1);
  });

  it("resolves a queued draw clock after the preceding draw commits", async () => {
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
    const renderer = new TestRenderer({ animate: false }, true);
    renderer.install(1000);
    renderer.blockNextDraw();

    now = 1100;
    const firstDraw = renderer.draw();
    await Promise.resolve();
    now = 1200;
    const secondDraw = renderer.draw();
    renderer.setPlaying(false);
    renderer.releaseDraw();
    await Promise.all([firstDraw, secondDraw]);

    // The second draw was queued at 1.2s but submitted after the first frame
    // committed and the clock was paused, so it must use the frozen 0.1s.
    expect(renderer.times).toEqual([0.1, 0.1]);
  });

  it("cancels pending RAFs and does not reschedule while paused", async () => {
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextRaf++;
      raf.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => raf.delete(id));
    vi.stubGlobal("window", { devicePixelRatio: 1 });

    const renderer = new TestRenderer({ playing: true });
    renderer.install(1000);
    expect(raf.size).toBe(1);
    renderer.setPlaying(false);
    expect(raf.size).toBe(0);
    runRaf(1100);
    await settled();
    expect(raf.size).toBe(0);

    renderer.setPlaying(true);
    expect(raf.size).toBe(1);
    runRaf(1200);
    await settled();
    expect(raf.size).toBe(1);
    renderer.dispose();
    expect(raf.size).toBe(0);
  });

  it("starts successful paused replacements at zero and resumes from zero", async () => {
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);

    const renderer = new TestRenderer({ animate: false });
    renderer.install(1000);
    now = 21_000;
    await renderer.draw();
    expect(renderer.times.at(-1)).toBeCloseTo(20);

    renderer.setPlaying(false);
    now = 30_000;
    renderer.install(30_000);
    await renderer.draw();
    expect(renderer.times.at(-1)).toBe(0);
    now = 90_000;
    await renderer.draw();
    expect(renderer.times.at(-1)).toBe(0);

    // Repeated Apply while paused starts each newly installed shader at zero.
    renderer.install(90_000);
    await renderer.draw();
    expect(renderer.times.at(-1)).toBe(0);

    renderer.setPlaying(true);
    now = 90_250;
    await renderer.draw();
    expect(renderer.times.at(-1)).toBeCloseTo(0.25);
  });

  it("leaves the old clock when a candidate fails or is superseded", async () => {
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
    const renderer = new TestRenderer({ animate: false });
    renderer.install(1000);
    now = 21_000;
    await renderer.draw();
    renderer.setPlaying(false);

    // A failed candidate computes its paused install frame but never commits it.
    expect(renderer.candidateTime(30_000)).toBe(0);
    // A superseded candidate likewise never reaches installed().
    renderer.cancelPendingShader();
    now = 90_000;
    await renderer.draw();
    expect(renderer.times.at(-1)).toBeCloseTo(20);
  });

  it("honors an explicit playing origin", async () => {
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
    const playing = new TestRenderer({ animate: false });
    now = 10_000;
    playing.install(9000);
    await playing.draw();
    expect(playing.times.at(-1)).toBeCloseTo(1);
  });
});
