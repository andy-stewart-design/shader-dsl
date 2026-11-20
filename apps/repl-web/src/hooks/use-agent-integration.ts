import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  createAuthoringController,
  type AuthoringControllerOptions,
} from "../agent/authoring-controller.ts";
import type { ApplyController } from "../agent/apply-controller.ts";
import type { AuthoringController } from "../agent/controller-types.ts";
import type { CapturePreviewPort } from "../agent/snapshot.ts";
import { createAuthoringTools } from "../agent/tools.ts";
import {
  editorRegistry,
  type EditorRegistry,
} from "../editor/authoring-adapter.ts";
import { useDraftStore } from "../stores/draft.ts";
import { useAgentActions } from "../stores/agent.ts";

export interface AgentIntegrationOptions {
  readonly editorRegistry?: EditorRegistry;
  readonly controller?: AuthoringController;
  readonly applyController?: ApplyController;
  readonly capturePortRef?: { current: CapturePreviewPort | null };
}

export function useAgentIntegration({
  editorRegistry: registry = editorRegistry,
  controller: suppliedController,
  applyController,
  capturePortRef,
}: AgentIntegrationOptions = {}) {
  const subscribe = useCallback(
    (listener: () => void) => registry.subscribe(listener),
    [registry],
  );
  const getSnapshot = useCallback(() => registry.areReady(), [registry]);
  const editorsReady = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false,
  );

  const baseController = useMemo(() => {
    if (!editorsReady && !suppliedController) return undefined;
    return (
      suppliedController ??
      createAuthoringController(useDraftStore, {
        editorRegistry: registry,
      } satisfies AuthoringControllerOptions)
    );
  }, [editorsReady, registry, suppliedController]);

  const controller = useMemo(() => {
    if (
      !baseController ||
      !applyController ||
      ("apply" in baseController && baseController.apply)
    )
      return baseController;
    return {
      ...baseController,
      apply: (request) => applyController.apply(request),
      isApplyReady: () => applyController.isReady?.() ?? false,
      getApplyState: () => applyController.getState(),
      subscribeApply: (listener) => applyController.subscribe(listener),
    } satisfies AuthoringController;
  }, [applyController, baseController]);

  const tools = useMemo(
    () => (controller ? createAuthoringTools(controller, capturePortRef) : []),
    [capturePortRef, controller],
  );
  const actions = useAgentActions();
  const enabled = editorsReady && Boolean(controller);

  useEffect(() => {
    void actions.setTools(tools).catch(() => undefined);
  }, [actions, tools]);

  useEffect(() => {
    actions.setEnabled(enabled);
    return () => actions.setEnabled(false);
  }, [actions, enabled]);
}
