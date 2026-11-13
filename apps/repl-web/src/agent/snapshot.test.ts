import assert from "node:assert/strict";
import test from "node:test";
import {
  CapturePreviewError,
  createCapturePreviewPort,
  type PreviewCaptureIdentity,
} from "./snapshot.ts";
import { createApplyController } from "./apply-controller.ts";
import type { CapturedCanvasPng } from "../preview/capture-canvas.ts";

const canvas = {} as HTMLCanvasElement;
const blob = new Blob(["png"], { type: "image/png" });

function sourceState() {
  let current: PreviewCaptureIdentity | null = {
    lifecycle: {},
    generation: 1,
    appliedRevision: 4,
    backend: "webgpu",
    canvas,
    width: 320,
    height: 180,
    uniforms: { gain: 0.5 },
  };
  return {
    read: () => current,
    replace(next: PreviewCaptureIdentity | null) {
      current = next;
    },
  };
}

function encoded(overrides: Partial<CapturedCanvasPng> = {}): CapturedCanvasPng {
  return {
    blob,
    width: 320,
    height: 180,
    mimeType: "image/png",
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: CapturePreviewError["code"]): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert(error instanceof CapturePreviewError);
    assert.equal(error.code, code);
    return true;
  });
}

test("capture returns the real canvas dimensions/backend/applied identity and uniforms", async () => {
  const source = sourceState();
  const port = createCapturePreviewPort({
    readIdentity: source.read,
    encode: async () => encoded(),
  });
  const result = await port.capture({ expectedAppliedRevision: 4 });
  assert.equal(result.blob, blob);
  assert.deepEqual(
    {
      width: result.width,
      height: result.height,
      backend: result.backend,
      appliedRevision: result.appliedRevision,
      uniforms: result.uniforms,
    },
    {
      width: 320,
      height: 180,
      backend: "webgpu",
      appliedRevision: 4,
      uniforms: { gain: 0.5 },
    },
  );
});

test("production lifecycle/canvas references are not serialized as capture identity", async () => {
  const lifecycle = {} as { current?: unknown };
  lifecycle.current = lifecycle;
  const productionCanvas = {} as { owner?: unknown } as HTMLCanvasElement;
  (productionCanvas as unknown as { owner?: unknown }).owner = productionCanvas;
  const uniforms = { gain: 0.5 };
  const current: PreviewCaptureIdentity = {
    lifecycle,
    generation: 1,
    appliedRevision: 4,
    backend: "webgpu",
    canvas: productionCanvas,
    width: 320,
    height: 180,
    uniforms,
  };
  let mutateDuringCapture = false;
  const port = createCapturePreviewPort({
    readIdentity: () => current,
    encode: async () => {
      if (mutateDuringCapture) uniforms.gain = 0.9;
      return encoded();
    },
  });

  const result = await port.capture({ expectedAppliedRevision: 4 });
  uniforms.gain = 0.75;
  assert.equal(result.uniforms.gain, 0.5);
  assert.doesNotThrow(() => JSON.stringify(result.uniforms));

  mutateDuringCapture = true;
  await expectCode(port.capture({ expectedAppliedRevision: 4 }), "identity-mismatch");
});

test("the production port defaults to 512, supports custom bounds, and preserves explicit native capture", async () => {
  const source = sourceState();
  source.replace({ ...source.read()!, width: 1209, height: 805 });
  const requested: string[] = [];
  const port = createCapturePreviewPort({
    readIdentity: source.read,
    encode: async (_canvas, options) => {
      requested.push(String(options.maxDimension));
      return options.maxDimension === "native"
        ? encoded({ width: 1209, height: 805 })
        : encoded({ width: 512, height: 340 });
    },
  });
  const bounded = await port.capture({ expectedAppliedRevision: 4 });
  const native = await port.capture({ expectedAppliedRevision: 4, maxDimension: "native" });
  assert.deepEqual([bounded.width, bounded.height], [512, 340]);
  assert.deepEqual([native.width, native.height], [1209, 805]);
  assert.deepEqual(requested, ["512", "native"]);
  assert.deepEqual([bounded.canvasWidth, bounded.canvasHeight], [1209, 805]);
});

test("invalid maxDimension is rejected before the encoder runs", async () => {
  const source = sourceState();
  let called = false;
  const port = createCapturePreviewPort({
    readIdentity: source.read,
    encode: async () => {
      called = true;
      return encoded();
    },
  });
  await expectCode(
    port.capture({ expectedAppliedRevision: 4, maxDimension: 32 }),
    "invalid-input",
  );
  assert.equal(called, false);
});

test("draft edits do not mislabel capture: expected applied identity remains authoritative", async () => {
  const source = sourceState();
  const port = createCapturePreviewPort({
    readIdentity: source.read,
    encode: async () => encoded(),
  });
  const result = await port.capture({ expectedAppliedRevision: 4 });
  source.replace({ ...source.read()!, generation: 2, appliedRevision: 4 });
  assert.equal(result.appliedRevision, 4);
});

test("identity changes while PNG encoding reject without returning pixels", async () => {
  const source = sourceState();
  let resolve!: (value: CapturedCanvasPng) => void;
  const port = createCapturePreviewPort({
    readIdentity: source.read,
    encode: () => new Promise((next) => { resolve = next; }),
  });
  const pending = port.capture({ expectedAppliedRevision: 4 });
  source.replace({ ...source.read()!, generation: 2, appliedRevision: 5 });
  resolve(encoded());
  await expectCode(pending, "identity-mismatch");
});

test("resize, replacement, unmount, and readiness failures are explicit", async () => {
  const source = sourceState();
  const port = createCapturePreviewPort({
    readIdentity: source.read,
    encode: async () => encoded(),
  });
  source.replace({ ...source.read()!, width: 640, height: 360 });
  await expectCode(port.capture({ expectedAppliedRevision: 4 }), "identity-mismatch");
  source.replace(null);
  await expectCode(port.capture({ expectedAppliedRevision: 4 }), "not-ready");
  source.replace({
    lifecycle: {},
    generation: 2,
    appliedRevision: 4,
    backend: "webgpu",
    canvas,
    width: 320,
    height: 180,
    uniforms: {},
  });
  let resolve!: (value: CapturedCanvasPng) => void;
  const replacementPort = createCapturePreviewPort({
    readIdentity: source.read,
    encode: () => new Promise((next) => { resolve = next; }),
  });
  const pending = replacementPort.capture({ expectedAppliedRevision: 4 });
  source.replace({
    lifecycle: {},
    generation: 3,
    appliedRevision: 4,
    backend: "webgl",
    canvas: {} as HTMLCanvasElement,
    width: 320,
    height: 180,
    uniforms: {},
  });
  resolve(encoded());
  await expectCode(pending, "identity-mismatch");
});

test("a registered capture returns no image when its renderer is disposed mid-encode", async () => {
  const lifecycle = {
    active: true,
    current: null as object | null,
  };
  lifecycle.current = lifecycle;
  const disposedCanvas = {} as HTMLCanvasElement;
  let resolveEncode!: (value: CapturedCanvasPng) => void;
  const source = {
    read: () => lifecycle.active
      ? {
          lifecycle,
          generation: 1,
          appliedRevision: 4,
          backend: "webgpu" as const,
          canvas: disposedCanvas,
          width: 320,
          height: 180,
          uniforms: {},
        }
      : null,
  };
  const port = createCapturePreviewPort({
    readIdentity: source.read,
    encode: () => new Promise((resolve) => { resolveEncode = resolve; }),
  });
  const pending = port.capture({ expectedAppliedRevision: 4 });
  await Promise.resolve();
  lifecycle.active = false;
  resolveEncode(encoded());
  await expectCode(pending, "identity-mismatch");
});

test("a real Apply and capture controller reject old pixels and preserve the latest applied state", async () => {
  const artifact = { glsl: "", wgsl: "", defaults: { glsl: [], wgsl: [] } };
  const oldLifecycle = {};
  const oldCanvas = {} as HTMLCanvasElement;
  const newLifecycle = {};
  const newCanvas = {} as HTMLCanvasElement;
  let draftRevision = 0;
  let appliedRevision = 0;
  let activeLifecycle: object = oldLifecycle;
  let activeCanvas = oldCanvas;
  let activeBackend: "webgpu" | "webgl" = "webgpu";
  let releaseOldCapture!: (value: CapturedCanvasPng) => void;
  const capture = createCapturePreviewPort({
    readIdentity: () => ({
      lifecycle: activeLifecycle,
      generation: appliedRevision,
      appliedRevision,
      backend: activeBackend,
      canvas: activeCanvas,
      width: 320,
      height: 180,
      uniforms: { gain: appliedRevision },
    }),
    encode: async (canvas) => {
      if (canvas === oldCanvas) {
        return new Promise((resolve) => { releaseOldCapture = resolve; });
      }
      return encoded();
    },
  });
  let releaseFrame!: () => void;
  const apply = createApplyController({
    readDraft: () => ({ revision: draftRevision, main: `source-${draftRevision}`, utils: "", uniforms: [] }),
    compile: async (snapshot) => {
      assert.equal(snapshot.revision, 1);
      return { ok: true as const, artifact };
    },
    preview: {
      current: {
        installAndDraw: async (_next, options) => {
          options.onDrawing?.();
          await new Promise<void>((resolve) => { releaseFrame = resolve; });
          return { backend: "webgl" as const };
        },
      },
    },
    onApplied: () => {
      appliedRevision = 1;
      activeLifecycle = newLifecycle;
      activeCanvas = newCanvas;
      activeBackend = "webgl";
    },
  });
  apply.confirmInitial(0, "webgpu");

  const oldCapture = capture.capture({ expectedAppliedRevision: 0 });
  await Promise.resolve();
  draftRevision = 1;
  const applying = apply.apply({ expectedRevision: 1 });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(typeof releaseFrame, "function");
  releaseFrame();
  const applied = await applying;
  assert.equal(applied.ok, true);
  assert.equal(apply.getState().phase, "applied");
  assert.equal(apply.getState().appliedRevision, 1);
  assert.deepEqual(apply.getState().diagnostics, []);

  releaseOldCapture(encoded());
  await expectCode(oldCapture, "identity-mismatch");

  const fresh = await capture.capture({ expectedAppliedRevision: 1 });
  assert.equal(fresh.appliedRevision, 1);
  assert.equal(fresh.backend, "webgl");
  assert.deepEqual(fresh.uniforms, { gain: 1 });
});

test("encoding, oversize, cancellation, and deadline failures return stable categories", async () => {
  const source = sourceState();
  const failing = createCapturePreviewPort({
    readIdentity: source.read,
    encode: async () => { throw new Error("encoder failed"); },
  });
  await expectCode(failing.capture({ expectedAppliedRevision: 4 }), "encoding");

  const oversized = createCapturePreviewPort({
    readIdentity: source.read,
    maxDecodedBytes: 1,
    encode: async () => {
      throw new CapturePreviewError("size", "PNG exceeds limit.");
    },
  });
  await expectCode(oversized.capture({ expectedAppliedRevision: 4 }), "size");

  const abort = new AbortController();
  abort.abort();
  const cancellable = createCapturePreviewPort({
    readIdentity: source.read,
    encode: async () => encoded(),
  });
  await expectCode(cancellable.capture({ expectedAppliedRevision: 4, signal: abort.signal }), "cancelled");

  const deadline = createCapturePreviewPort({
    readIdentity: source.read,
    timeoutMs: 5,
    encode: () => new Promise(() => {}),
  });
  await expectCode(deadline.capture({ expectedAppliedRevision: 4 }), "deadline");
});
