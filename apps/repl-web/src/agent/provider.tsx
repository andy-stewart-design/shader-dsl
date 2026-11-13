import {
  connectAgentBridge,
  consumePairingLink,
  type BridgeConnectionState,
} from "@shdr/agent-bridge/browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
import { editorRegistry, type EditorRegistry } from "../editor/authoring-adapter.ts";
import { useDraftStore } from "../stores/draft.ts";

// This runs at client module evaluation, before the provider renders. The
// bridge itself never receives the original URL once this value is consumed.
const initialPairingLink = consumePairingLink();

type AgentBridge = ReturnType<typeof connectAgentBridge>;
export type AgentBridgeFactory = typeof connectAgentBridge;

export interface AgentProviderProps {
  readonly children: ReactNode;
  readonly editorRegistry?: EditorRegistry;
  readonly bridgeFactory?: AgentBridgeFactory;
  readonly controller?: AuthoringController;
  readonly applyController?: ApplyController;
  readonly capturePortRef?: { current: CapturePreviewPort | null };
}

export interface AgentConnectionContextValue {
  readonly state: BridgeConnectionState;
  readonly editorsReady: boolean;
  readonly connect: (pairingLink: string) => Promise<void>;
  readonly disconnect: () => void;
}

const AgentConnectionContext = createContext<
  AgentConnectionContextValue | undefined
>(undefined);

export function AgentProvider({
  children,
  editorRegistry: registry = editorRegistry,
  bridgeFactory = connectAgentBridge,
  controller: suppliedController,
  applyController,
  capturePortRef,
}: AgentProviderProps) {
  const bridgeRef = useRef<AgentBridge | null>(null);
  const controllerRef = useRef<AuthoringController | null>(
    suppliedController ?? null,
  );
  const pendingLinkRef = useRef<string | undefined>(initialPairingLink);
  const [editorsReady, setEditorsReady] = useState(() => registry.areReady());
  const [state, setState] = useState<BridgeConnectionState>({
    status: "disconnected",
  });

  useEffect(() => {
    const update = () => setEditorsReady(registry.areReady());
    const unsubscribe = registry.subscribe(update);
    update();
    return unsubscribe;
  }, [registry]);

  useEffect(() => {
    if (!editorsReady || bridgeRef.current) return;

    const authoringController: AuthoringController =
      controllerRef.current ??
      createAuthoringController(useDraftStore, {
        editorRegistry: registry,
      } satisfies AuthoringControllerOptions);
    const controller: AuthoringController =
      applyController && !authoringController.apply
        ? {
            ...authoringController,
            apply: applyController.apply,
            getApplyState: applyController.getState,
            subscribeApply: applyController.subscribe,
          }
        : authoringController;
    controllerRef.current = controller;
    const bridge = bridgeFactory({
      tools: createAuthoringTools(controller, capturePortRef),
      onStateChange: setState,
    });
    bridgeRef.current = bridge;
    setState(bridge.getState());

    const pairingLink = pendingLinkRef.current;
    pendingLinkRef.current = undefined;
    if (pairingLink) {
      void bridge.connect(pairingLink).catch(() => {
        // The bridge publishes a redacted error state. Do not echo or log the
        // one-time pairing credential.
      });
    }
  }, [applyController, bridgeFactory, capturePortRef, editorsReady, registry]);

  const connect = useCallback(async (pairingLink: string) => {
    const trimmed = pairingLink.trim();
    if (!trimmed) throw new Error("A pairing link is required.");
    const bridge = bridgeRef.current;
    if (!bridge) {
      pendingLinkRef.current = trimmed;
      return;
    }
    await bridge.connect(trimmed);
  }, []);

  const disconnect = useCallback(() => {
    bridgeRef.current?.disconnect();
  }, []);

  return (
    <AgentConnectionContext.Provider
      value={{ state, editorsReady, connect, disconnect }}
    >
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
