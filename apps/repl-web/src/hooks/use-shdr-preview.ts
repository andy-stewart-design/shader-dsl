import { useEffect, useEffectEvent, useRef } from "react";
import type { CompiledFragmentArtifact } from "shdr";
import { createPreview, type PreviewHandle } from "../preview/create-preview";

export interface UseShdrPreviewOptions {
  artifact: CompiledFragmentArtifact;
  playing?: boolean;
  onError?: (error: unknown) => void;
}

type PreviewLifecycle = {
  active: boolean;
  abortController: AbortController;
  generation: number;
  initializing: boolean;
  latestArtifact: CompiledFragmentArtifact;
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
  void lifecycle.handle.setShader(artifact).catch((error: unknown) => {
    if (
      !lifecycle.active ||
      lifecycle.abortController.signal.aborted ||
      generation !== lifecycle.generation
    )
      return;
    reportError(error);
  });
}

export function useShdrPreview({
  artifact,
  playing = true,
  onError,
}: UseShdrPreviewOptions) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latestArtifactRef = useRef(artifact);
  const latestPlayingRef = useRef(playing);
  const lifecycleRef = useRef<PreviewLifecycle | null>(null);
  const reportError = useEffectEvent((error: unknown) => {
    onError?.(error);
  });

  useEffect(() => {
    latestArtifactRef.current = artifact;
    const lifecycle = lifecycleRef.current;
    if (lifecycle?.active) {
      const previousArtifact = lifecycle.latestArtifact;
      lifecycle.latestArtifact = artifact;
      if (previousArtifact !== artifact) lifecycle.failedArtifact = undefined;
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
      generation: 0,
      initializing: false,
      latestArtifact: latestArtifactRef.current,
    };
    lifecycleRef.current = lifecycle;

    const initialize = (): void => {
      if (
        !isActive(lifecycle, lifecycleRef.current) ||
        lifecycle.handle ||
        lifecycle.initializing ||
        lifecycle.failedArtifact === lifecycle.latestArtifact
      )
        return;

      const artifact = lifecycle.latestArtifact;
      const generation = lifecycle.generation;
      const playing = latestPlayingRef.current;
      let reportedError = false;
      lifecycle.initializing = true;
      lifecycle.initializingArtifact = artifact;
      void createPreview({
        parent,
        artifact,
        playing,
        signal: lifecycle.abortController.signal,
        onError: (error) => {
          if (!isActive(lifecycle, lifecycleRef.current)) return;
          if (lifecycle.initializing) {
            if (
              reportedError ||
              lifecycle.initializingArtifact !== artifact ||
              lifecycle.generation !== generation
            )
              return;
            reportedError = true;
          } else if (lifecycle.rendererArtifact !== artifact) return;
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
          lifecycle.rendererArtifact = artifact;
          lifecycle.handle = handle;
          lifecycle.requestedArtifact = artifact;
          lifecycle.requestedPlaying = playing;
          const latestPlaying = latestPlayingRef.current;
          if (latestPlaying !== playing)
            updatePlaying(lifecycle, latestPlaying, reportError);
          if (lifecycle.latestArtifact !== artifact) {
            updateArtifact(lifecycle, lifecycle.latestArtifact, reportError);
          }
        },
        (error: unknown) => {
          lifecycle.initializing = false;
          lifecycle.initializingArtifact = undefined;
          if (!isActive(lifecycle, lifecycleRef.current)) return;
          if (
            lifecycle.generation !== generation ||
            lifecycle.latestArtifact !== artifact
          ) {
            initialize();
            return;
          }

          lifecycle.failedArtifact = artifact;
          if (!reportedError) reportError(error);
        },
      );
    };

    lifecycle.retry = initialize;

    // Renderer sizing happens during a draw. Observe the CSS-sized host so a
    // paused preview still picks up ratio and pane resizes.
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

  return hostRef;
}
