import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { CompiledFragmentArtifact } from "shdr";
import { createPreview, type PreviewHandle } from "../preview/create-preview";
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
    // setShader can carry overrides across compatible replacements. An Apply
    // is intentionally a reset boundary, even when the artifact is identical.
    handle.resetUniforms();
    const patch = runtimeValuesToPatch(
      lifecycle.installedRuntimeUniforms,
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
      applyRuntimeValues(lifecycle, reportError);
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
  }>({ uniforms: runtimeUniforms, values: initialRuntimeValues });
  const reportError = useEffectEvent((error: unknown) => {
    onError?.(error);
  });
  const publishRuntimeState = (
    uniforms: readonly RuntimeUniform[],
    values: RuntimeUniformValues,
  ): void => {
    runtimeUniformsRef.current = uniforms;
    runtimeValuesRef.current = values;
    setRuntimeState({ uniforms, values });
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
      publishRuntimeState,
    };
    // Used by the small helpers above to reject stale renderer lifecycles.
    lifecycle.current = lifecycle;
    lifecycleRef.current = lifecycle;

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
      lifecycle.handle?.destroy();
      lifecycle.handle = undefined;
    };
  }, []);

  function onRuntimeValueChange(name: string, value: RuntimeUniformValue): void {
    if (!runtimeUniformsRef.current.some((uniform) => uniform.name === name))
      return;
    const next = { ...runtimeValuesRef.current, [name]: value };
    const uniforms = runtimeUniformsRef.current;
    publishRuntimeState(uniforms, next);
    const lifecycle = lifecycleRef.current;
    if (!lifecycle?.active) return;
    lifecycle.installedRuntimeUniforms = uniforms;
    lifecycle.installedRuntimeValues = next;
    // During initial creation the latest snapshot is also the only snapshot.
    if (!lifecycle.rendererArtifact)
      lifecycle.latestRuntimeValues = next;
    applyRuntimeValues(lifecycle, (error) => onError?.(error));
  }

  return {
    hostRef,
    runtimeUniforms: runtimeState.uniforms,
    runtimeValues,
    onRuntimeValueChange,
  };
}
