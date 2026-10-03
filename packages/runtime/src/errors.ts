export type RendererBackend = "webgl" | "webgpu";
export type RuntimeErrorKind =
  | "unavailable"
  | "surface"
  | "artifact"
  | "uniform"
  | "shader"
  | "draw"
  | "lost"
  | "aborted"
  | "disposed";

/** Generated-shader/backend errors, never original-source Shdr diagnostics. */
export class ShdrRuntimeError extends Error {
  constructor(
    readonly backend: RendererBackend,
    readonly kind: RuntimeErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ShdrRuntimeError";
  }
}

export function runtimeError(
  backend: RendererBackend,
  kind: RuntimeErrorKind,
  error: unknown,
): ShdrRuntimeError {
  if (error instanceof ShdrRuntimeError) return error;
  return new ShdrRuntimeError(
    backend,
    kind,
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
}
