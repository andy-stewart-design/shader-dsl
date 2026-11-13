import assert from "node:assert/strict";
import test from "node:test";
import { captureCanvas, CaptureCanvasError } from "./capture-canvas.ts";

interface FakeCanvas extends HTMLCanvasElement {
  drawImageArgs?: readonly unknown[];
  encodedBlob?: Blob;
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
      callback(
        (canvas as FakeCanvas).encodedBlob ??
          new Blob(["png"], { type: "image/png" }),
      );
    },
    getContext() {
      return {
        drawImage(...args: unknown[]) {
          (canvas as FakeCanvas).drawImageArgs = args;
          const snapshot = args[0] as { nativeBlob?: Blob } | undefined;
          if (snapshot?.nativeBlob) {
            (canvas as FakeCanvas).encodedBlob = new Blob(
              ["resized-from-", snapshot.nativeBlob],
              { type: "image/png" },
            );
          }
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
  const previousBitmap = (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
  const nativeBlob = new Blob(["native-captured-pixels"], { type: "image/png" });
  const bitmap = { close() {}, nativeBlob };
  // Model a presented WebGPU buffer that is already cleared by the time a
  // post-frame 2D draw would inspect the renderer canvas directly.
  source.getContext = (() => ({
    drawImage() {
      throw new Error("presented GPU buffer was cleared");
    },
  })) as unknown as HTMLCanvasElement["getContext"];
  (globalThis as { createImageBitmap?: unknown }).createImageBitmap = async (blob: Blob) => {
    assert.equal(blob, nativeBlob);
    return bitmap;
  };
  try {
    source.encodedBlob = nativeBlob;
    const result = await captureCanvas(source, { maxDimension: 512 });
    assert.deepEqual([result.width, result.height], [512, 340]);
    assert.equal(await result.blob.text(), "resized-from-native-captured-pixels");
    assert.deepEqual(source.drawImageArgs, undefined);
    assert.deepEqual((source.ownerDocument as FakeDocument).lastCanvas?.drawImageArgs, [
      bitmap,
      0,
      0,
      512,
      340,
    ]);
  } finally {
    if (previousBitmap === undefined)
      delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
    else (globalThis as { createImageBitmap?: unknown }).createImageBitmap = previousBitmap;
  }
});

test("small canvases are never upscaled and native explicitly preserves dimensions", async () => {
  const small = makeCanvas(320, 180, makeDocument());
  const native = makeCanvas(1209, 805, makeDocument());
  const nativeResult = await captureCanvas(native, { maxDimension: "native" });
  const smallResult = await captureCanvas(small, { maxDimension: 512 });
  assert.deepEqual([smallResult.width, smallResult.height], [320, 180]);
  assert.deepEqual([nativeResult.width, nativeResult.height], [1209, 805]);
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
