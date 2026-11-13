import assert from "node:assert/strict";
import test from "node:test";
import { captureCanvas, CaptureCanvasError } from "./capture-canvas.ts";

interface FakeCanvas extends HTMLCanvasElement {
  drawImageArgs?: readonly unknown[];
}

interface FakeDocument extends Document {
  lastCanvas?: FakeCanvas;
}

function makeCanvas(width: number, height: number, ownerDocument?: Document): FakeCanvas {
  const canvas = {
    width,
    height,
    ownerDocument,
    toBlob(callback: BlobCallback) {
      callback(new Blob(["png"], { type: "image/png" }));
    },
    getContext() {
      return {
        drawImage(...args: unknown[]) {
          (canvas as FakeCanvas).drawImageArgs = args;
        },
      } as unknown as CanvasRenderingContext2D;
    },
  } as unknown as FakeCanvas;
  return canvas;
}

function makeDocument(): FakeDocument {
  const document = {} as FakeDocument;
  document.createElement = (() => {
    const canvas = makeCanvas(0, 0, document);
    document.lastCanvas = canvas;
    return canvas;
  }) as Document["createElement"];
  return document;
}

async function expectCode(
  promise: Promise<unknown>,
  code: CaptureCanvasError["code"],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert(error instanceof CaptureCanvasError);
    assert.equal(error.code, code);
    return true;
  });
}

test("default bounded capture downsamples a large canvas without changing its aspect ratio", async () => {
  const source = makeCanvas(1209, 805, makeDocument());
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = globalThis;
  try {
    const result = await captureCanvas(source, { maxDimension: 512 });
    assert.deepEqual([result.width, result.height], [512, 340]);
    assert.deepEqual(source.drawImageArgs, undefined);
    assert.deepEqual((source.ownerDocument as FakeDocument).lastCanvas?.drawImageArgs, [
      source,
      0,
      0,
      512,
      340,
    ]);
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test("small canvases are never upscaled and native explicitly preserves dimensions", async () => {
  const small = makeCanvas(320, 180, makeDocument());
  const native = makeCanvas(1209, 805, makeDocument());
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = globalThis;
  try {
    const smallResult = await captureCanvas(small, { maxDimension: 512 });
    const nativeResult = await captureCanvas(native, { maxDimension: "native" });
    assert.deepEqual([smallResult.width, smallResult.height], [320, 180]);
    assert.deepEqual([nativeResult.width, nativeResult.height], [1209, 805]);
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test("invalid and oversized native bounds fail before encoding", async () => {
  let encoded = false;
  const source = makeCanvas(3000, 3000, makeDocument());
  source.toBlob = (() => {
    encoded = true;
  }) as unknown as HTMLCanvasElement["toBlob"];
  await expectCode(captureCanvas(source, { maxDimension: 32 }), "size");
  await expectCode(captureCanvas(source, { maxDimension: "native" }), "size");
  assert.equal(encoded, false);
});
