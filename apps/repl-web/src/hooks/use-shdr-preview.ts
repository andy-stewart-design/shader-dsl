import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { CompiledFragmentArtifact } from "shdr";
import { createPreview, type PreviewHandle } from "../preview/create-preview";
import type { ApplyPreviewPort } from "../agent/apply-controller.ts";
import {
  createCapturePreviewPort,
  type CapturePreviewPort,
} from "../agent/snapshot.ts";
import {
  defaultRuntimeValues,
  runtimeValuesToPatch,
  type RuntimeUniform,
  type RuntimeUniformValue,
  type RuntimeUniformValues,
} from "../components/preview-pane/uniform-controls";

export interface UseShdrPreviewOptions {
  artifact: CompiledFragmentArtifact;
  /** Snapshot from the last successful apply, not the editor draft. */
  runtimeUniforms?: readonly RuntimeUniform[];
  playing?: boolean;
  onError?: (error: unknown) => void;
  /** App-local awaitable Apply seam; never exposed as a bridge primitive. */
  applyPortRef?: { current: ApplyPreviewPort | null };
  /** App-local capture seam; registration is cleared with the renderer lifecycle. */
  capturePortRef?: { current: CapturePreviewPort | null };
  /** Applied identity is owned by the compile/apply controller, not React timing. */
  getAppliedRevision?: () => number | null;
  onInitialFrame?: (info: { readonly backend: "webgpu" | "webgl"; readonly artifact: CompiledFragmentArtifact }) => void;
}

type PreviewLifecycle = {
  active: boolean;
  abortController: AbortController;
  current: PreviewLifecycle | null;
  generation: number;
  initializing: boolean;
  latestArtifact: CompiledFragmentArtifact;
  latestRuntimeUniforms: readonly RuntimeUniform[];
  latestRuntimeValues: RuntimeUniformValues;
  installedRuntimeUniforms: readonly RuntimeUniform[];
  installedRuntimeValues: RuntimeUniformValues;
  /** Names explicitly changed through the preview controls. */
  runtimeOverrideNames: Set<string>;
  publishRuntimeState: (
    uniforms: readonly RuntimeUniform[],
    values: RuntimeUniformValues,
  ) => void;
  frame?: number;
  handle?: PreviewHandle;
  rendererArtifact?: CompiledFragmentArtifact;
  initializingArtifact?: CompiledFragmentArtifact;
  failedArtifact?: CompiledFragmentArtifact;
  retry?: () => void;
  requestedArtifact?: CompiledFragmentArtifact;
  requestedPlaying?: boolean;
};

function raceWithAbort<T>(
  promise: Promise<T>,
  signals: readonly AbortSignal[],
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signals.forEach((signal) => signal.removeEventListener("abort", abort));
    const abort = () => {
      cleanup();
      reject(new Error("Preview operation aborted."));
    };
    if (signals.some((signal) => signal.aborted)) {
      abort();
      return;
    }
    signals.forEach((signal) => signal.addEventListener("abort", abort, { once: true }));
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function isActive(
  lifecycle: PreviewLifecycle,
  current: PreviewLifecycle | null,
): boolean {
  return (
    lifecycle.active &&
    current === lifecycle &&
    !lifecycle.abortController.signal.aborted
  );
}

function drawIfPaused(
  lifecycle: PreviewLifecycle,
  reportError: (error: unknown) => void,
): void {
  if (lifecycle.requestedPlaying || !lifecycle.handle) return;
  void lifecycle.handle.draw().catch((error: unknown) => {
    if (lifecycle.active && !lifecycle.abortController.signal.aborted)
      reportError(error);
  });
}

/** Applies the controls belonging to the renderer's installed artifact. */
function applyRuntimeValues(
  lifecycle: PreviewLifecycle,
  reportError: (error: unknown) => void,
): void {
  const handle = lifecycle.handle;
  if (!handle || !lifecycle.rendererArtifact || !isActive(lifecycle, lifecycle.current))
    return;

  try {
    // An authored Apply is a reset boundary. Only names explicitly changed
    // through the controls are written back through setUniforms: the runtime
    // correctly treats every setUniforms key as a persistent override, which
    // would make an old authored default win over a later same-name/type one.
    handle.resetUniforms();
    const patch = runtimeValuesToPatch(
      lifecycle.installedRuntimeUniforms.filter((uniform) =>
        lifecycle.runtimeOverrideNames.has(uniform.name),
      ),
      lifecycle.installedRuntimeValues,
    );
    if (Object.keys(patch).length > 0) handle.setUniforms(patch);
    drawIfPaused(lifecycle, reportError);
  } catch (error: unknown) {
    if (isActive(lifecycle, lifecycle.current)) reportError(error);
  }
}

function installRuntimeSnapshot(
  lifecycle: PreviewLifecycle,
  artifact: CompiledFragmentArtifact,
  uniforms: readonly RuntimeUniform[],
  values: RuntimeUniformValues,
): void {
  lifecycle.rendererArtifact = artifact;
  lifecycle.installedRuntimeUniforms = uniforms;
  lifecycle.installedRuntimeValues = values;
  lifecycle.publishRuntimeState(uniforms, values);
}

function updatePlaying(
  lifecycle: PreviewLifecycle,
  playing: boolean,
  reportError: (error: unknown) => void,
): void {
  if (!lifecycle.handle || lifecycle.requestedPlaying === playing) return;

  lifecycle.requestedPlaying = playing;
  try {
    lifecycle.handle.setPlaying(playing);
  } catch (error: unknown) {
    if (lifecycle.active && !lifecycle.abortController.signal.aborted)
      reportError(error);
  }
}

function updateArtifact(
  lifecycle: PreviewLifecycle,
  artifact: CompiledFragmentArtifact,
  reportError: (error: unknown) => void,
): void {
  if (!lifecycle.handle || lifecycle.requestedArtifact === artifact) return;

  lifecycle.requestedArtifact = artifact;
  const generation = ++lifecycle.generation;
  const handle = lifecycle.handle;
  void handle.setShader(artifact).then(
    (result) => {
      if (
        !isActive(lifecycle, lifecycle.current) ||
        generation !== lifecycle.generation ||
        lifecycle.latestArtifact !== artifact ||
        result.status !== "installed"
      )
        return;
      installRuntimeSnapshot(
        lifecycle,
        artifact,
        lifecycle.latestRuntimeUniforms,
        lifecycle.latestRuntimeValues,
      );
      // setShader already carries genuine runtime overrides. Do not reset
      // them or rewrite authored defaults as persistent overrides here.
    },
    (error: unknown) => {
      if (
        !lifecycle.active ||
        lifecycle.abortController.signal.aborted ||
        generation !== lifecycle.generation
      )
        return;
      // The renderer kept the previous shader installed. Restore its controls
      // too, so a failed replacement cannot leave the UI detached from it.
      lifecycle.publishRuntimeState(
        lifecycle.installedRuntimeUniforms,
        lifecycle.installedRuntimeValues,
      );
      reportError(error);
    },
  );
}

export function useShdrPreview({
  artifact,
  runtimeUniforms = [],
  playing = true,
  onError,
  applyPortRef,
  capturePortRef,
  getAppliedRevision,
  onInitialFrame,
}: UseShdrPreviewOptions) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latestArtifactRef = useRef(artifact);
  const latestPlayingRef = useRef(playing);
  const runtimeUniformsRef = useRef(runtimeUniforms);
  const initialRuntimeValues = defaultRuntimeValues(runtimeUniforms);
  const runtimeValuesRef = useRef<RuntimeUniformValues>(
    initialRuntimeValues,
  );
  const lifecycleRef = useRef<PreviewLifecycle | null>(null);
  const [runtimeState, setRuntimeState] = useState<{
    uniforms: readonly RuntimeUniform[];
    values: RuntimeUniformValues;
    runtimeControlsKey: number;
  }>({
    uniforms: runtimeUniforms,
    values: initialRuntimeValues,
    runtimeControlsKey: 0,
  });
  const reportError = useEffectEvent((error: unknown) => {
    onError?.(error);
  });
  const publishRuntimeState = (
    uniforms: readonly RuntimeUniform[],
    values: RuntimeUniformValues,
  ): void => {
    runtimeUniformsRef.current = uniforms;
    runtimeValuesRef.current = values;
    setRuntimeState((previous) => ({
      uniforms,
      values,
      runtimeControlsKey:
        previous.uniforms === uniforms
          ? previous.runtimeControlsKey
          : previous.runtimeControlsKey + 1,
    }));
  };
  const runtimeValues = runtimeState.values;

  useEffect(() => {
    const defaults = defaultRuntimeValues(runtimeUniforms);
    const lifecycle = lifecycleRef.current;
    if (lifecycle?.active) {
      lifecycle.latestRuntimeUniforms = runtimeUniforms;
      lifecycle.latestRuntimeValues = defaults;
      // Before the first renderer exists there is no installed snapshot to
      // preserve, so keep controls useful if initialization is delayed.
      if (!lifecycle.handle && !lifecycle.rendererArtifact) {
        lifecycle.installedRuntimeUniforms = runtimeUniforms;
        lifecycle.installedRuntimeValues = defaults;
        publishRuntimeState(runtimeUniforms, defaults);
      } else if (lifecycle.handle && lifecycle.rendererArtifact) {
        lifecycle.installedRuntimeUniforms = runtimeUniforms;
        lifecycle.installedRuntimeValues = defaults;
        publishRuntimeState(runtimeUniforms, defaults);
        // A successful Apply has already reset the renderer before its first
        // candidate frame; keep the new authored defaults as values, not
        // persistent host overrides.
        applyRuntimeValues(lifecycle, reportError);
      }
    }
  }, [runtimeUniforms]);

  useEffect(() => {
    latestArtifactRef.current = artifact;
    const lifecycle = lifecycleRef.current;
    if (lifecycle?.active) {
      const previousArtifact = lifecycle.latestArtifact;
      lifecycle.latestArtifact = artifact;
      if (previousArtifact !== artifact) {
        lifecycle.failedArtifact = undefined;
        lifecycle.latestRuntimeValues = defaultRuntimeValues(
          lifecycle.latestRuntimeUniforms,
        );
      }
      if (lifecycle.handle) updateArtifact(lifecycle, artifact, reportError);
      else {
        lifecycle.generation++;
        lifecycle.retry?.();
      }
    }
  }, [artifact]);

  useEffect(() => {
    latestPlayingRef.current = playing;
    const lifecycle = lifecycleRef.current;
    if (lifecycle?.active && lifecycle.handle)
      updatePlaying(lifecycle, playing, reportError);
  }, [playing]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const parent = hostRef.current;
    if (!parent) return;

    const lifecycle: PreviewLifecycle = {
      active: true,
      abortController: new AbortController(),
      current: null,
      generation: 0,
      initializing: false,
      latestArtifact: latestArtifactRef.current,
      latestRuntimeUniforms: runtimeUniformsRef.current,
      latestRuntimeValues: runtimeValuesRef.current,
      installedRuntimeUniforms: runtimeUniformsRef.current,
      installedRuntimeValues: runtimeValuesRef.current,
      runtimeOverrideNames: new Set(),
      publishRuntimeState,
    };
    // Used by the small helpers above to reject stale renderer lifecycles.
    lifecycle.current = lifecycle;
    lifecycleRef.current = lifecycle;

    const port: ApplyPreviewPort = {
      async installAndDraw(nextArtifact, options) {
        const handle = lifecycle.handle;
        if (!isActive(lifecycle, lifecycleRef.current) || !handle) {
          throw new Error("Preview renderer is not ready.");
        }
        if (options.signal.aborted) throw new Error("Apply was cancelled.");
        const generation = ++lifecycle.generation;
        const result = await raceWithAbort(
          handle.setShader(nextArtifact),
          [options.signal, lifecycle.abortController.signal],
        );
        if (
          options.signal.aborted ||
          !isActive(lifecycle, lifecycleRef.current) ||
          generation !== lifecycle.generation ||
          result.status !== "installed"
        ) {
          throw new Error("Preview installation was superseded.");
        }
        lifecycle.rendererArtifact = nextArtifact;
        lifecycle.requestedArtifact = nextArtifact;
        // setShader intentionally preserves compatible explicit host
        // overrides. Apply, however, is the REPL's reset boundary. Reset only
        // after installation succeeds so a failed candidate leaves the
        // previous shader and its runtime values untouched, then draw the
        // candidate with its actual new defaults.
        handle.resetUniforms();
        options.onDrawing?.();
        if (options.signal.aborted) throw new Error("Apply was cancelled.");
        await raceWithAbort(handle.draw(), [
          options.signal,
          lifecycle.abortController.signal,
        ]);
        if (
          options.signal.aborted ||
          !isActive(lifecycle, lifecycleRef.current) ||
          generation !== lifecycle.generation
        ) throw new Error("Preview draw was superseded.");
        // Clear old explicit overrides only after the replacement's default
        // frame has succeeded; a failed candidate preserves them.
        lifecycle.runtimeOverrideNames.clear();
        installRuntimeSnapshot(
          lifecycle,
          nextArtifact,
          lifecycle.latestRuntimeUniforms,
          lifecycle.latestRuntimeValues,
        );
        return { backend: lifecycle.handle!.backend };
      },
    };
    if (applyPortRef) applyPortRef.current = port;
    if (capturePortRef) {
      capturePortRef.current = createCapturePreviewPort({
        readIdentity: () => {
          const handle = lifecycle.handle;
          if (!handle || !isActive(lifecycle, lifecycleRef.current)) return null;
          return {
            lifecycle,
            generation: lifecycle.generation,
            appliedRevision: getAppliedRevision?.() ?? null,
            backend: handle.backend,
            canvas: handle.canvas,
            width: handle.canvas.width,
            height: handle.canvas.height,
            uniforms: lifecycle.installedRuntimeValues,
          };
        },
      });
    }

    const initialize = (): void => {
      if (
        !isActive(lifecycle, lifecycleRef.current) ||
        lifecycle.handle ||
        lifecycle.initializing ||
        lifecycle.failedArtifact === lifecycle.latestArtifact
      )
        return;

      const initializedArtifact = lifecycle.latestArtifact;
      const generation = lifecycle.generation;
      const initialPlaying = latestPlayingRef.current;
      const initializingRuntimeUniforms = lifecycle.latestRuntimeUniforms;
      const initializingRuntimeValues = lifecycle.latestRuntimeValues;
      let reportedError = false;
      lifecycle.initializing = true;
      lifecycle.initializingArtifact = initializedArtifact;
      void createPreview({
        parent,
        artifact: initializedArtifact,
        playing: initialPlaying,
        signal: lifecycle.abortController.signal,
        onError: (error) => {
          if (!isActive(lifecycle, lifecycleRef.current)) return;
          if (lifecycle.initializing) {
            if (
              reportedError ||
              lifecycle.initializingArtifact !== initializedArtifact ||
              lifecycle.generation !== generation
            )
              return;
            reportedError = true;
          } else if (lifecycle.rendererArtifact !== initializedArtifact) return;
          reportError(error);
        },
      }).then(
        (handle) => {
          lifecycle.initializing = false;
          lifecycle.initializingArtifact = undefined;
          if (!isActive(lifecycle, lifecycleRef.current)) {
            handle.destroy();
            return;
          }

          lifecycle.failedArtifact = undefined;
          lifecycle.handle = handle;
          lifecycle.requestedArtifact = initializedArtifact;
          lifecycle.requestedPlaying = initialPlaying;
          const initializedLatest =
            lifecycle.latestArtifact === initializedArtifact;
          installRuntimeSnapshot(
            lifecycle,
            initializedArtifact,
            initializedLatest
              ? lifecycle.latestRuntimeUniforms
              : initializingRuntimeUniforms,
            initializedLatest
              ? lifecycle.latestRuntimeValues
              : initializingRuntimeValues,
          );
          applyRuntimeValues(lifecycle, reportError);
          onInitialFrame?.({ backend: handle.backend, artifact: initializedArtifact });
          const latestPlaying = latestPlayingRef.current;
          if (latestPlaying !== initialPlaying)
            updatePlaying(lifecycle, latestPlaying, reportError);
          if (lifecycle.latestArtifact !== initializedArtifact) {
            updateArtifact(lifecycle, lifecycle.latestArtifact, reportError);
          }
        },
        (error: unknown) => {
          lifecycle.initializing = false;
          lifecycle.initializingArtifact = undefined;
          if (!isActive(lifecycle, lifecycleRef.current)) return;
          if (
            lifecycle.generation !== generation ||
            lifecycle.latestArtifact !== initializedArtifact
          ) {
            initialize();
            return;
          }

          lifecycle.failedArtifact = initializedArtifact;
          if (!reportedError) reportError(error);
        },
      );
    };

    lifecycle.retry = initialize;

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            const handle = lifecycle.handle;
            if (
              latestPlayingRef.current ||
              !handle ||
              !isActive(lifecycle, lifecycleRef.current)
            )
              return;
            void handle.draw().catch((error: unknown) => {
              if (isActive(lifecycle, lifecycleRef.current)) reportError(error);
            });
          });
    resizeObserver?.observe(parent);

    lifecycle.frame = requestAnimationFrame(() => {
      lifecycle.frame = undefined;
      initialize();
    });

    return () => {
      lifecycle.active = false;
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null;
      if (lifecycle.frame !== undefined) cancelAnimationFrame(lifecycle.frame);
      resizeObserver?.disconnect();
      lifecycle.abortController.abort();
      if (applyPortRef?.current === port) applyPortRef.current = null;
      if (capturePortRef) capturePortRef.current = null;
      lifecycle.handle?.destroy();
      lifecycle.handle = undefined;
    };
  }, [applyPortRef, capturePortRef, getAppliedRevision, onInitialFrame]);

  function onRuntimeValueChange(name: string, value: RuntimeUniformValue): void {
    if (!runtimeUniformsRef.current.some((uniform) => uniform.name === name))
      return;
    const next = { ...runtimeValuesRef.current, [name]: value };
    const uniforms = runtimeUniformsRef.current;
    const lifecycle = lifecycleRef.current;
    lifecycle?.runtimeOverrideNames.add(name);
    publishRuntimeState(uniforms, next);
    if (!lifecycle?.active) return;
    lifecycle.installedRuntimeUniforms = uniforms;
    lifecycle.installedRuntimeValues = next;
    // During initial creation the latest snapshot is also the only snapshot.
    if (!lifecycle.rendererArtifact)
      lifecycle.latestRuntimeValues = next;
    const handle = lifecycle.handle;
    if (!handle || !lifecycle.rendererArtifact) return;
    try {
      // Only the value the user changed becomes a persistent renderer
      // override. Rewriting every control value here would turn untouched
      // authored defaults into overrides and make replacement metadata lie.
      const patch = runtimeValuesToPatch(
        uniforms.filter((uniform) => uniform.name === name),
        { [name]: value },
      );
      if (Object.keys(patch).length > 0) handle.setUniforms(patch);
      drawIfPaused(lifecycle, (error) => onError?.(error));
    } catch (error: unknown) {
      if (isActive(lifecycle, lifecycle.current)) onError?.(error);
    }
  }

  return {
    hostRef,
    runtimeUniforms: runtimeState.uniforms,
    runtimeValues,
    runtimeControlsKey: runtimeState.runtimeControlsKey,
    onRuntimeValueChange,
  };
}
