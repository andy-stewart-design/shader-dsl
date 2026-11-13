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

/** Encodes the current bitmap without changing the canvas or renderer state. */
export function captureCanvas(
  canvas: HTMLCanvasElement,
  {
    maxDecodedBytes = DEFAULT_MAX_DECODED_BYTES,
    timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
    maxDimension = "native",
  }: CaptureCanvasOptions = {},
): Promise<CapturedCanvasPng> {
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) {
    return Promise.reject(
      new CaptureCanvasError(
        "zero-size",
        `Cannot capture a zero-size canvas (${width}×${height}).`,
      ),
    );
  }
  if (!Number.isFinite(maxDecodedBytes) || maxDecodedBytes <= 0) {
    return Promise.reject(
      new CaptureCanvasError("size", "The PNG byte limit must be positive."),
    );
  }
  if (
    maxDimension !== "native" &&
    (!Number.isSafeInteger(maxDimension) ||
      maxDimension < MIN_CAPTURE_DIMENSION ||
      maxDimension > MAX_CAPTURE_DIMENSION)
  ) {
    return Promise.reject(
      new CaptureCanvasError(
        "size",
        `maxDimension must be an integer from ${MIN_CAPTURE_DIMENSION} to ${MAX_CAPTURE_DIMENSION}, or "native".`,
      ),
    );
  }
  if (maxDimension === "native" && width * height > MAX_CAPTURE_PIXELS) {
    return Promise.reject(
      new CaptureCanvasError(
        "size",
        `Native capture is limited to ${MAX_CAPTURE_PIXELS} pixels.`,
      ),
    );
  }
  if (typeof canvas.toBlob !== "function") {
    return Promise.reject(
      new CaptureCanvasError("unsupported", "This browser does not support canvas.toBlob()."),
    );
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(
      new CaptureCanvasError("timeout", "The capture timeout must be positive."),
    );
  }

  const scale =
    maxDimension === "native"
      ? 1
      : Math.min(1, maxDimension / Math.max(width, height));
  const outputWidth = Math.max(1, Math.floor(width * scale));
  const outputHeight = Math.max(1, Math.floor(height * scale));
  let encoderCanvas = canvas;
  if (outputWidth !== width || outputHeight !== height) {
    const ownerDocument =
      canvas.ownerDocument ??
      (typeof document === "undefined" ? undefined : document);
    if (!ownerDocument) {
      return Promise.reject(
        new CaptureCanvasError(
          "unsupported",
          "A browser document is required to downsample this canvas.",
        ),
      );
    }
    const temporaryCanvas = ownerDocument.createElement("canvas");
    temporaryCanvas.width = outputWidth;
    temporaryCanvas.height = outputHeight;
    const context = temporaryCanvas.getContext("2d");
    if (!context) {
      return Promise.reject(
        new CaptureCanvasError(
          "unsupported",
          "The browser does not support a 2D canvas for PNG downsampling.",
        ),
      );
    }
    try {
      context.drawImage(canvas, 0, 0, outputWidth, outputHeight);
    } catch (error) {
      return Promise.reject(
        new CaptureCanvasError(
          isTaintedError(error) ? "tainted" : "encoding",
          isTaintedError(error)
            ? "The canvas is tainted and cannot be downsampled."
            : `PNG downsampling failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        ),
      );
    }
    encoderCanvas = temporaryCanvas;
  }

  return new Promise<CapturedCanvasPng>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new CaptureCanvasError(
          "timeout",
          `PNG encoding did not finish within ${timeoutMs} ms.`,
        ),
      );
    }, timeoutMs);
    const fail = (error: CaptureCanvasError): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    };

    try {
      encoderCanvas.toBlob((blob) => {
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
        window.clearTimeout(timer);
        resolve({
          blob,
          width: encoderCanvas.width,
          height: encoderCanvas.height,
          mimeType: PNG_MIME_TYPE,
        });
      }, PNG_MIME_TYPE);
    } catch (error) {
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
