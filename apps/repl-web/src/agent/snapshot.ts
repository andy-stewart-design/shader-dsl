import {
  captureCanvas,
  CaptureCanvasError,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  DEFAULT_MAX_DECODED_BYTES,
  DEFAULT_MAX_DIMENSION,
  MAX_CAPTURE_DIMENSION,
  MIN_CAPTURE_DIMENSION,
  type CaptureMaxDimension,
  type CapturedCanvasPng,
} from "../preview/capture-canvas.ts";
import type { RuntimeUniformValues } from "../components/preview-pane/uniform-controls.ts";

export type CapturePreviewErrorCode =
  | "invalid-input"
  | "not-ready"
  | "identity-mismatch"
  | "cancelled"
  | "deadline"
  | "zero-size"
  | "size"
  | "unsupported"
  | "tainted"
  | "encoding"
  | "null-blob";

export class CapturePreviewError extends Error {
  readonly code: CapturePreviewErrorCode;

  constructor(code: CapturePreviewErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CapturePreviewError";
    this.code = code;
  }
}

export interface PreviewCaptureIdentity {
  /** Stable identity for one mounted renderer lifecycle. */
  readonly lifecycle: object;
  readonly generation: number;
  readonly appliedRevision: number | null;
  readonly backend: "webgpu" | "webgl";
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly uniforms: RuntimeUniformValues;
}

export interface PreviewCaptureResult extends CapturedCanvasPng {
  /** Native source canvas dimensions, distinct from the encoded PNG dimensions. */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly backend: "webgpu" | "webgl";
  readonly appliedRevision: number;
  readonly uniforms: RuntimeUniformValues;
  /** Internal final guard used after app-side base64 conversion. */
  readonly assertCurrent: () => void;
}

export interface CapturePreviewRequest {
  readonly expectedAppliedRevision: number;
  readonly maxDimension?: CaptureMaxDimension;
  readonly signal?: AbortSignal;
}

export interface CapturePreviewPort {
  capture(request: CapturePreviewRequest): Promise<PreviewCaptureResult>;
}

export interface CreateCapturePreviewPortOptions {
  readonly readIdentity: () => PreviewCaptureIdentity | null;
  readonly maxDecodedBytes?: number;
  readonly timeoutMs?: number;
  readonly maxDimension?: CaptureMaxDimension;
  readonly encode?: (
    canvas: HTMLCanvasElement,
    options: {
      readonly maxDecodedBytes: number;
      readonly timeoutMs: number;
      readonly maxDimension: CaptureMaxDimension;
    },
  ) => Promise<CapturedCanvasPng>;
}

/**
 * Copy the semantic values used by the preview controls, not their owning
 * React/runtime objects. The renderer lifecycle and canvas are deliberately
 * live objects (and may contain back-references), so they must only be used
 * for identity checks by reference.
 */
function cloneUniformValues(values: RuntimeUniformValues): RuntimeUniformValues {
  const snapshot: Record<string, number | string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== "number" && typeof value !== "string") {
      throw new CapturePreviewError(
        "encoding",
        `Runtime uniform ${name} is not a JSON-safe scalar value.`,
      );
    }
    snapshot[name] = value;
  }
  return snapshot;
}

function sameUniformValues(
  first: RuntimeUniformValues,
  second: RuntimeUniformValues,
): boolean {
  const firstNames = Object.keys(first);
  const secondNames = Object.keys(second);
  if (firstNames.length !== secondNames.length) return false;
  return firstNames.every(
    (name) =>
      Object.hasOwn(second, name) && Object.is(first[name], second[name]),
  );
}

function sameSemanticIdentity(
  first: PreviewCaptureIdentity,
  second: PreviewCaptureIdentity,
  expectedUniforms: RuntimeUniformValues,
): boolean {
  return (
    first.generation === second.generation &&
    first.appliedRevision === second.appliedRevision &&
    first.backend === second.backend &&
    first.width === second.width &&
    first.height === second.height &&
    sameUniformValues(expectedUniforms, cloneUniformValues(second.uniforms))
  );
}

function isCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function raceWithCaptureDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
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
      finish(() =>
        reject(new CapturePreviewError("cancelled", "Preview capture was cancelled.")),
      );
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new CapturePreviewError(
              "deadline",
              `Preview capture exceeded the ${timeoutMs} ms deadline.`,
            ),
          ),
        ),
      timeoutMs,
    );

    if (isCancelled(signal)) {
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

function normalizeCaptureError(error: unknown): CapturePreviewError {
  if (error instanceof CapturePreviewError) return error;
  if (error instanceof CaptureCanvasError) {
    if (error.code === "timeout")
      return new CapturePreviewError("deadline", error.message, { cause: error });
    return new CapturePreviewError(error.code, error.message, { cause: error });
  }
  return new CapturePreviewError(
    "encoding",
    `Preview PNG capture failed: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  );
}

/**
 * Captures one registered renderer lifecycle. The identity is checked before
 * encoding and after it completes so an old canvas can never be retagged as a
 * newer Apply result.
 */
export function createCapturePreviewPort({
  readIdentity,
  maxDecodedBytes = DEFAULT_MAX_DECODED_BYTES,
  timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
  maxDimension = DEFAULT_MAX_DIMENSION,
  encode = captureCanvas,
}: CreateCapturePreviewPortOptions): CapturePreviewPort {
  return {
    async capture({ expectedAppliedRevision, maxDimension: requestedMaxDimension, signal }) {
      if (!Number.isSafeInteger(expectedAppliedRevision) || expectedAppliedRevision < 0)
        throw new CapturePreviewError("identity-mismatch", "expectedAppliedRevision must be a non-negative integer.");
      if (isCancelled(signal))
        throw new CapturePreviewError("cancelled", "Preview capture was cancelled.");
      const effectiveMaxDimension = requestedMaxDimension ?? maxDimension;
      if (
        effectiveMaxDimension !== "native" &&
        (!Number.isSafeInteger(effectiveMaxDimension) ||
          effectiveMaxDimension < MIN_CAPTURE_DIMENSION ||
          effectiveMaxDimension > MAX_CAPTURE_DIMENSION)
      ) {
        throw new CapturePreviewError(
          "invalid-input",
          `maxDimension must be an integer from ${MIN_CAPTURE_DIMENSION} to ${MAX_CAPTURE_DIMENSION}, or "native".`,
        );
      }
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        throw new CapturePreviewError("deadline", "Preview capture deadline must be positive.");

      const before = readIdentity();
      if (!before)
        throw new CapturePreviewError("not-ready", "The preview renderer is not ready for capture.");
      if (before.appliedRevision !== expectedAppliedRevision)
        throw new CapturePreviewError(
          "identity-mismatch",
          `Expected applied revision ${expectedAppliedRevision}, but the preview is at ${before.appliedRevision ?? "none"}.`,
        );
      if (before.width <= 0 || before.height <= 0)
        throw new CapturePreviewError("zero-size", "The active preview canvas has no pixels.");

      // Snapshot only the primitive values that describe the draw. Do not
      // serialize the live lifecycle/canvas graph: the lifecycle points back
      // to itself and browser canvases commonly point into other cyclic DOM
      // state.
      const expectedUniforms = cloneUniformValues(before.uniforms);
      const scale =
        effectiveMaxDimension === "native"
          ? 1
          : Math.min(1, effectiveMaxDimension / Math.max(before.width, before.height));
      const expectedEncodedWidth = Math.max(1, Math.floor(before.width * scale));
      const expectedEncodedHeight = Math.max(1, Math.floor(before.height * scale));
      let encoded: CapturedCanvasPng;
      try {
        encoded = await raceWithCaptureDeadline(
          encode(before.canvas, {
            maxDecodedBytes,
            timeoutMs,
            maxDimension: effectiveMaxDimension,
          }),
          signal,
          timeoutMs,
        );
      } catch (error) {
        throw normalizeCaptureError(error);
      }
      if (isCancelled(signal))
        throw new CapturePreviewError("cancelled", "Preview capture was cancelled.");

      const after = readIdentity();
      if (
        !after ||
        after.lifecycle !== before.lifecycle ||
        !sameSemanticIdentity(before, after, expectedUniforms) ||
        after.canvas !== before.canvas ||
        after.width !== before.width ||
        after.height !== before.height ||
        encoded.width !== expectedEncodedWidth ||
        encoded.height !== expectedEncodedHeight ||
        after.appliedRevision !== expectedAppliedRevision
      ) {
        throw new CapturePreviewError(
          "identity-mismatch",
          "The preview changed while its PNG was being encoded; no image was returned.",
        );
      }
      const assertCurrent = (): void => {
        if (isCancelled(signal))
          throw new CapturePreviewError("cancelled", "Preview capture was cancelled.");
        const current = readIdentity();
        if (
          !current ||
          current.lifecycle !== before.lifecycle ||
          !sameSemanticIdentity(before, current, expectedUniforms) ||
          current.canvas !== before.canvas ||
          current.appliedRevision !== expectedAppliedRevision
        ) {
          throw new CapturePreviewError(
            "identity-mismatch",
            "The preview changed before the captured image was delivered.",
          );
        }
      };
      return {
        ...encoded,
        canvasWidth: before.width,
        canvasHeight: before.height,
        backend: after.backend,
        appliedRevision: expectedAppliedRevision,
        uniforms: cloneUniformValues(expectedUniforms),
        assertCurrent,
      };
    },
  };
}
