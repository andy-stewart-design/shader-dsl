import type { CompiledFragmentArtifact } from "shdr";
import type { DraftSnapshot } from "./authoring-controller.ts";
import type { Uniform } from "../shared/uniforms.ts";

export type ApplyDocument = "main" | "utils" | "uniforms" | "preview";
export type ApplyDiagnosticCode =
  | "syntax"
  | "type"
  | "uniform"
  | "backend"
  | "install"
  | "draw"
  | "cancelled"
  | "stale"
  | "superseded"
  | "disconnected";

export interface ApplyDiagnostic {
  readonly code: ApplyDiagnosticCode;
  readonly message: string;
  readonly document?: ApplyDocument;
  readonly range?: { readonly start: number; readonly length: number };
}

export type ApplyPhase =
  | "idle"
  | "compiling"
  | "installing"
  | "drawing"
  | "applied"
  | "failed"
  | "cancelled"
  | "stale"
  | "superseded";

export interface ApplyState {
  readonly phase: ApplyPhase;
  readonly attemptId: number;
  readonly expectedRevision?: number;
  readonly draftRevision?: number;
  readonly appliedRevision: number | null;
  readonly appliedBackend?: "webgpu" | "webgl";
  readonly diagnostics: readonly ApplyDiagnostic[];
}

export interface ApplyErrorPresentation {
  readonly compileError: string | null;
  readonly runtimeError: string | null;
}

/**
 * Reduces controller state into the existing editor status surface. Pending
 * and non-current terminal states intentionally leave the visible error alone:
 * only the current failed attempt may replace it, and a confirmed apply clears
 * both channels.
 */
export function updateApplyErrorPresentation(
  previous: ApplyErrorPresentation,
  next: ApplyState,
): ApplyErrorPresentation {
  if (next.phase === "applied") {
    return { compileError: null, runtimeError: null };
  }
  if (next.phase !== "failed" || next.diagnostics.length === 0) {
    return previous;
  }

  const message = next.diagnostics.map((item) => item.message).join("\n");
  const firstCode = next.diagnostics[0]?.code;
  if (firstCode === "syntax" || firstCode === "type" || firstCode === "uniform") {
    return { compileError: message, runtimeError: previous.runtimeError };
  }
  return { compileError: previous.compileError, runtimeError: message };
}

export interface ApplyRequest {
  readonly expectedRevision: number;
  readonly signal?: AbortSignal;
}

export type ApplyResult =
  | {
      readonly ok: true;
      readonly attemptId: number;
      readonly draftRevision: number;
      readonly appliedRevision: number;
      readonly backend: "webgpu" | "webgl";
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly attemptId: number;
      readonly draftRevision?: number;
      readonly error: ApplyDiagnostic;
      readonly diagnostics: readonly ApplyDiagnostic[];
    };

export interface ApplyCompileSuccess {
  readonly ok: true;
  readonly artifact: CompiledFragmentArtifact;
}
export interface ApplyCompileFailure {
  readonly ok: false;
  readonly diagnostics: readonly ApplyDiagnostic[];
}
export type ApplyCompileResult = ApplyCompileSuccess | ApplyCompileFailure;

export interface ApplyPreviewPort {
  installAndDraw(
    artifact: CompiledFragmentArtifact,
    options: {
      readonly signal: AbortSignal;
      readonly onDrawing?: () => void;
    },
  ): Promise<{ readonly backend: "webgpu" | "webgl" }>;
}

export interface ApplyControllerOptions {
  readonly readDraft: () => DraftSnapshot;
  readonly compile: (
    snapshot: DraftSnapshot,
  ) => ApplyCompileResult | Promise<ApplyCompileResult>;
  readonly preview: { current: ApplyPreviewPort | null };
  readonly onApplied?: (snapshot: DraftSnapshot, artifact: CompiledFragmentArtifact) => void;
}

export interface ApplyController {
  apply(request: ApplyRequest): Promise<ApplyResult>;
  getState(): ApplyState;
  subscribe(listener: () => void): () => void;
  /** Records the initial renderer frame; it is called only after real creation. */
  confirmInitial(revision: number, backend: "webgpu" | "webgl"): void;
}

export function createApplyController(
  options: ApplyControllerOptions,
): ApplyController {
  let attemptId = 0;
  let active: { readonly id: number; readonly abort: AbortController } | null = null;
  let state: ApplyState = {
    phase: "idle",
    attemptId: 0,
    appliedRevision: null,
    diagnostics: [],
  };
  const listeners = new Set<() => void>();
  const publish = (next: ApplyState): void => {
    state = next;
    for (const listener of listeners) listener();
  };
  const preservedApplied = () => ({
    appliedRevision: state.appliedRevision,
    ...(state.appliedBackend ? { appliedBackend: state.appliedBackend } : {}),
  });
  const diagnosticResult = (
    id: number,
    revision: number | undefined,
    diagnostic: ApplyDiagnostic,
    phase: ApplyPhase = "failed",
  ): ApplyResult => {
    // Late superseded work settles for its caller but cannot overwrite the
    // status owned by a newer attempt.
    if (active?.id !== id) {
      return {
        ok: false,
        attemptId: id,
        ...(revision === undefined ? {} : { draftRevision: revision }),
        error: diagnostic,
        diagnostics: [diagnostic],
      };
    }
    publish({
      phase,
      attemptId: id,
      ...(revision === undefined ? {} : { draftRevision: revision }),
      ...preservedApplied(),
      expectedRevision: state.expectedRevision,
      diagnostics: [diagnostic],
    });
    return {
      ok: false,
      attemptId: id,
      ...(revision === undefined ? {} : { draftRevision: revision }),
      error: diagnostic,
      diagnostics: [diagnostic],
    };
  };

  return {
    async apply(request) {
      const id = ++attemptId;
      if (active) active.abort.abort();
      const abort = new AbortController();
      active = { id, abort };
      if (request.signal?.aborted) abort.abort();
      const onAbort = () => abort.abort();
      request.signal?.addEventListener("abort", onAbort, { once: true });
      const snapshot = options.readDraft();
      if (snapshot.revision !== request.expectedRevision) {
        const diagnostic: ApplyDiagnostic = {
          code: "stale",
          message: `Expected draft revision ${request.expectedRevision}, but current revision is ${snapshot.revision}.`,
        };
        return diagnosticResult(id, snapshot.revision, diagnostic, "stale");
      }
      publish({
        phase: "compiling",
        attemptId: id,
        expectedRevision: request.expectedRevision,
        draftRevision: snapshot.revision,
        ...preservedApplied(),
        diagnostics: [],
      });
      const isCurrent = () => active?.id === id && !abort.signal.aborted;
      try {
        const compiled = await awaitAbortable(options.compile(snapshot), abort.signal);
        if (!isCurrent()) {
          return diagnosticResult(id, snapshot.revision, {
            code: request.signal?.aborted ? "cancelled" : "superseded",
            message: request.signal?.aborted
              ? "Apply was cancelled before installation."
              : "Apply was superseded by a newer request.",
          }, request.signal?.aborted ? "cancelled" : "superseded");
        }
        if (!compiled.ok) {
          const first = compiled.diagnostics[0] ?? {
            code: "syntax" as const,
            message: "Compilation failed.",
          };
          publish({
            phase: "failed",
            attemptId: id,
            draftRevision: snapshot.revision,
            expectedRevision: request.expectedRevision,
            ...preservedApplied(),
            diagnostics: compiled.diagnostics,
          });
          return {
            ok: false,
            attemptId: id,
            draftRevision: snapshot.revision,
            error: first,
            diagnostics: compiled.diagnostics,
          };
        }
        const port = options.preview.current;
        if (!port) {
          return diagnosticResult(id, snapshot.revision, {
            code: "backend",
            message: "Preview renderer is not ready.",
            document: "preview",
          });
        }
        publish({
          phase: "installing",
          attemptId: id,
          draftRevision: snapshot.revision,
          expectedRevision: request.expectedRevision,
          ...preservedApplied(),
          diagnostics: [],
        });
        const installed = await awaitAbortable(port.installAndDraw(compiled.artifact, {
          signal: abort.signal,
          onDrawing: () => {
            if (!isCurrent()) return;
            publish({
              phase: "drawing",
              attemptId: id,
              draftRevision: snapshot.revision,
              expectedRevision: request.expectedRevision,
              ...preservedApplied(),
              diagnostics: [],
            });
          },
        }), abort.signal);
        if (!isCurrent()) {
          return diagnosticResult(id, snapshot.revision, {
            code: request.signal?.aborted ? "cancelled" : "superseded",
            message: request.signal?.aborted
              ? "Apply was cancelled; the renderer was not replayed."
              : "Apply completion was superseded by a newer request.",
          }, request.signal?.aborted ? "cancelled" : "superseded");
        }
        // installAndDraw resolves only after the renderer's own frame promise.
        // No timeout or RAF heuristic is used here.
        publish({
          phase: "applied",
          attemptId: id,
          draftRevision: snapshot.revision,
          expectedRevision: request.expectedRevision,
          appliedRevision: snapshot.revision,
          appliedBackend: installed.backend,
          diagnostics: [],
        });
        options.onApplied?.(snapshot, compiled.artifact);
        return {
          ok: true,
          attemptId: id,
          draftRevision: snapshot.revision,
          appliedRevision: snapshot.revision,
          backend: installed.backend,
          diagnostics: [],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const diagnostic: ApplyDiagnostic = {
          code: abort.signal.aborted ? "cancelled" : classifyRuntimeError(error),
          message: abort.signal.aborted ? "Apply was cancelled." : message,
          document: "preview",
        };
        return diagnosticResult(
          id,
          snapshot.revision,
          diagnostic,
          abort.signal.aborted ? "cancelled" : "failed",
        );
      } finally {
        request.signal?.removeEventListener("abort", onAbort);
        if (active?.id === id) active = null;
      }
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    confirmInitial(revision, backend) {
      publish({
        phase: "applied",
        attemptId: state.attemptId,
        draftRevision: revision,
        appliedRevision: revision,
        appliedBackend: backend,
        diagnostics: state.diagnostics,
      });
    },
  };
}

class ApplyAbortError extends Error {
  constructor() {
    super("Apply was cancelled.");
    this.name = "ApplyAbortError";
  }
}

function awaitAbortable<T>(value: T | PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new ApplyAbortError());
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new ApplyAbortError());
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(value).then(
      (result) => {
        signal.removeEventListener("abort", abort);
        resolve(result);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function classifyRuntimeError(error: unknown): ApplyDiagnosticCode {
  const kind = typeof error === "object" && error !== null && "kind" in error
    ? String((error as { kind?: unknown }).kind)
    : "install";
  return kind === "draw" ? "draw" : kind === "uniform" ? "uniform" : kind === "unavailable" || kind === "lost" ? "backend" : "install";
}

export function cloneUniformSnapshot(uniforms: readonly Uniform[]): readonly Uniform[] {
  return structuredClone(uniforms);
}
