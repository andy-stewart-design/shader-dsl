export const PNG_MIME_TYPE = "image/png" as const;
export const DEFAULT_MAX_DECODED_BYTES = 4 * 1024 * 1024;
export const DEFAULT_CAPTURE_TIMEOUT_MS = 5_000;
export const DEFAULT_MAX_DIMENSION = 512;
export const MIN_CAPTURE_DIMENSION = 64;
export const MAX_CAPTURE_DIMENSION = 2_048;
export const MAX_CAPTURE_PIXELS = MAX_CAPTURE_DIMENSION * MAX_CAPTURE_DIMENSION;

export type CaptureMaxDimension = number | "native";

export type CaptureCanvasErrorCode =
  | "zero-size"
  | "size"
  | "unsupported"
  | "tainted"
  | "encoding"
  | "null-blob"
  | "timeout";

export class CaptureCanvasError extends Error {
  readonly code: CaptureCanvasErrorCode;

  constructor(code: CaptureCanvasErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CaptureCanvasError";
    this.code = code;
  }
}

export interface CaptureCanvasOptions {
  readonly maxDecodedBytes?: number;
  readonly timeoutMs?: number;
  /** Maximum output edge; native preserves the source dimensions explicitly. */
  readonly maxDimension?: CaptureMaxDimension;
  /** Aborts decode and encoding work at the same boundary as the capture port. */
  readonly signal?: AbortSignal;
}

export interface CapturedCanvasPng {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly mimeType: typeof PNG_MIME_TYPE;
}

function isTaintedError(error: unknown): boolean {
  const isSecurityException =
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "SecurityError";
  return isSecurityException || (error instanceof Error && /security|taint/i.test(error.message));
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("PNG capture was cancelled.");
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void =>
      finish(() => reject(new Error("PNG capture was cancelled.")));
    const timer = setTimeout(
      () => finish(() => reject(new CaptureCanvasError(
        "timeout",
        `PNG capture did not finish within ${timeoutMs} ms.`,
      ))),
      timeoutMs,
    );
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  maxDecodedBytes: number,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<CapturedCanvasPng> {
  assertNotAborted(signal);
  return new Promise<CapturedCanvasPng>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      fail(
        new CaptureCanvasError(
          "timeout",
          `PNG encoding did not finish within ${timeoutMs} ms.`,
        ),
      );
    }, timeoutMs);
    const fail = (error: CaptureCanvasError): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    };
    const onAbort = (): void =>
      fail(new CaptureCanvasError("timeout", "PNG capture was cancelled."));
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      canvas.toBlob((blob) => {
        signal?.removeEventListener("abort", onAbort);
        if (settled) return;
        if (blob === null) {
          fail(
            new CaptureCanvasError(
              "null-blob",
              "The browser returned no PNG blob for this canvas.",
            ),
          );
          return;
        }
        // This is the binary PNG size before base64, not the raw RGBA bitmap size.
        if (blob.size > maxDecodedBytes) {
          fail(
            new CaptureCanvasError(
              "size",
              `PNG is ${blob.size} bytes; limit is ${maxDecodedBytes}.`,
            ),
          );
          return;
        }
        if (blob.type !== PNG_MIME_TYPE) {
          fail(
            new CaptureCanvasError(
              "encoding",
              `Canvas returned ${blob.type || "an unknown type"} instead of image/png.`,
            ),
          );
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({
          blob,
          width: canvas.width,
          height: canvas.height,
          mimeType: PNG_MIME_TYPE,
        });
      }, PNG_MIME_TYPE);
    } catch (error) {
      signal?.removeEventListener("abort", onAbort);
      fail(
        new CaptureCanvasError(
          isTaintedError(error) ? "tainted" : "encoding",
          isTaintedError(error)
            ? "The canvas is tainted and cannot be exported."
            : `PNG encoding failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        ),
      );
    }
  });
}

type DecodedSnapshot = {
  readonly source: CanvasImageSource;
  readonly close: () => void;
};

async function decodeNativePng(
  blob: Blob,
  canvas: HTMLCanvasElement,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<DecodedSnapshot> {
  assertNotAborted(signal);
  if (typeof createImageBitmap === "function") {
    const bitmapPromise = createImageBitmap(blob);
    try {
      const bitmap = await withTimeout(bitmapPromise, timeoutMs, signal);
      return { source: bitmap, close: () => bitmap.close() };
    } catch (error) {
      // A timed-out bitmap decode can still resolve later; close it rather
      // than retaining the intermediate native snapshot in the browser.
      void bitmapPromise.then((bitmap) => bitmap.close(), () => undefined);
      if (error instanceof CaptureCanvasError || signal?.aborted) throw error;
      // Some browsers expose createImageBitmap but do not support Blob input;
      // use the HTML image path before reporting an unsupported decoder.
    }
  }

  const ownerDocument =
    canvas.ownerDocument ?? (typeof document === "undefined" ? undefined : document);
  const objectUrl =
    typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(blob)
      : undefined;
  if (!ownerDocument || !objectUrl) {
    throw new CaptureCanvasError(
      "unsupported",
      "This browser cannot decode a captured PNG for downsampling.",
    );
  }

  const image = ownerDocument.createElement("img");
  try {
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Captured PNG could not be decoded."));
      image.src = objectUrl;
    });
    await withTimeout(loaded, timeoutMs, signal);
    return {
      source: image,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * Encodes the current bitmap without changing the canvas or renderer state.
 * A bounded capture is intentionally blob-first: WebGPU may clear its
 * presented canvas outside the render submission, while the native toBlob
 * snapshot remains the browser's captured frame.
 */
export async function captureCanvas(
  canvas: HTMLCanvasElement,
  {
    maxDecodedBytes = DEFAULT_MAX_DECODED_BYTES,
    timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
    maxDimension = "native",
    signal,
  }: CaptureCanvasOptions = {},
): Promise<CapturedCanvasPng> {
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) {
    throw new CaptureCanvasError(
      "zero-size",
      `Cannot capture a zero-size canvas (${width}×${height}).`,
    );
  }
  if (!Number.isFinite(maxDecodedBytes) || maxDecodedBytes <= 0) {
    throw new CaptureCanvasError("size", "The PNG byte limit must be positive.");
  }
  if (
    maxDimension !== "native" &&
    (!Number.isSafeInteger(maxDimension) ||
      maxDimension < MIN_CAPTURE_DIMENSION ||
      maxDimension > MAX_CAPTURE_DIMENSION)
  ) {
    throw new CaptureCanvasError(
      "size",
      `maxDimension must be an integer from ${MIN_CAPTURE_DIMENSION} to ${MAX_CAPTURE_DIMENSION}, or "native".`,
    );
  }
  if (width * height > MAX_CAPTURE_PIXELS) {
    throw new CaptureCanvasError(
      "size",
      `${maxDimension === "native" ? "Native capture" : "Capture"} is limited to ${MAX_CAPTURE_PIXELS} pixels.`,
    );
  }
  if (typeof canvas.toBlob !== "function") {
    throw new CaptureCanvasError("unsupported", "This browser does not support canvas.toBlob().");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new CaptureCanvasError("timeout", "The capture timeout must be positive.");
  }
  assertNotAborted(signal);

  const scale =
    maxDimension === "native"
      ? 1
      : Math.min(1, maxDimension / Math.max(width, height));
  const outputWidth = Math.max(1, Math.floor(width * scale));
  const outputHeight = Math.max(1, Math.floor(height * scale));

  // This is the only read from the renderer canvas. Do it before any 2D
  // target is created so resizing cannot read a cleared post-present buffer.
  const native = await encodeCanvas(canvas, maxDecodedBytes, timeoutMs, signal);
  if (outputWidth === width && outputHeight === height) return native;

  let decoded: DecodedSnapshot | undefined;
  try {
    decoded = await decodeNativePng(native.blob, canvas, timeoutMs, signal);
    assertNotAborted(signal);
    const ownerDocument =
      canvas.ownerDocument ?? (typeof document === "undefined" ? undefined : document);
    if (!ownerDocument) {
      throw new CaptureCanvasError(
        "unsupported",
        "A browser document is required to downsample this canvas.",
      );
    }
    const temporaryCanvas = ownerDocument.createElement("canvas");
    temporaryCanvas.width = outputWidth;
    temporaryCanvas.height = outputHeight;
    const context = temporaryCanvas.getContext("2d");
    if (!context) {
      throw new CaptureCanvasError(
        "unsupported",
        "The browser does not support a 2D canvas for PNG downsampling.",
      );
    }
    try {
      // The source is the decoded native blob, never the renderer canvas.
      context.drawImage(decoded.source, 0, 0, outputWidth, outputHeight);
    } catch (error) {
      throw new CaptureCanvasError(
        isTaintedError(error) ? "tainted" : "encoding",
        isTaintedError(error)
          ? "The captured PNG is tainted and cannot be downsampled."
          : `PNG downsampling failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    assertNotAborted(signal);
    return await encodeCanvas(temporaryCanvas, maxDecodedBytes, timeoutMs, signal);
  } finally {
    decoded?.close();
  }
}
