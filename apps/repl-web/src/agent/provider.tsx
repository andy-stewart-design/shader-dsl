import {
  AgentBridgeProvider,
  useAgentBridge,
  type AgentBridgeFactory,
} from "app-mcp/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createAuthoringController,
  type AuthoringControllerOptions,
} from "./authoring-controller.ts";
import type { AuthoringController } from "./controller-types.ts";
import type { ApplyController } from "./apply-controller.ts";
import type { CapturePreviewPort } from "./snapshot.ts";
import { createAuthoringTools } from "./tools.ts";
import {
  editorRegistry,
  type EditorRegistry,
} from "#/editor/authoring-adapter.ts";
import { useDraftStore } from "#/stores/draft.ts";

export type { AgentBridgeFactory };

export interface AgentProviderProps {
  readonly children: ReactNode;
  readonly editorRegistry?: EditorRegistry;
  readonly bridgeFactory?: AgentBridgeFactory;
  readonly controller?: AuthoringController;
  readonly applyController?: ApplyController;
  readonly capturePortRef?: { current: CapturePreviewPort | null };
}

export interface AgentConnectionContextValue {
  readonly state: ReturnType<typeof useAgentBridge>["state"];
  readonly editorsReady: boolean;
  readonly connect: ReturnType<typeof useAgentBridge>["connect"];
  readonly disconnect: ReturnType<typeof useAgentBridge>["disconnect"];
}

const AgentConnectionContext = createContext<
  AgentConnectionContextValue | undefined
>(undefined);

export function AgentProvider({
  children,
  editorRegistry: registry = editorRegistry,
  bridgeFactory,
  controller: suppliedController,
  applyController,
  capturePortRef,
}: AgentProviderProps) {
  const [editorsReady, setEditorsReady] = useState(() => registry.areReady());

  useEffect(() => {
    const update = () => setEditorsReady(registry.areReady());
    const unsubscribe = registry.subscribe(update);
    update();
    return unsubscribe;
  }, [registry]);

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
      apply: applyController.apply,
      isApplyReady: () => applyController.isReady?.() ?? false,
      getApplyState: applyController.getState,
      subscribeApply: applyController.subscribe,
    } satisfies AuthoringController;
  }, [applyController, baseController]);

  const tools = useMemo(
    () => (controller ? createAuthoringTools(controller, capturePortRef) : []),
    [capturePortRef, controller],
  );

  return (
    <AgentBridgeProvider
      tools={tools}
      enabled={editorsReady && Boolean(controller)}
      bridgeFactory={bridgeFactory}
    >
      <AgentConnectionAdapter editorsReady={editorsReady}>
        {children}
      </AgentConnectionAdapter>
    </AgentBridgeProvider>
  );
}

function AgentConnectionAdapter({
  children,
  editorsReady,
}: {
  readonly children: ReactNode;
  readonly editorsReady: boolean;
}) {
  const bridge = useAgentBridge();
  const value = useMemo(
    () => ({ ...bridge, editorsReady }),
    [bridge, editorsReady],
  );
  return (
    <AgentConnectionContext.Provider value={value}>
      {children}
    </AgentConnectionContext.Provider>
  );
}

export function useAgentConnection(): AgentConnectionContextValue {
  const value = useContext(AgentConnectionContext);
  if (!value) {
    throw new Error("useAgentConnection must be used inside AgentProvider.");
  }
  return value;
}
