import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createBridgeLifecycle,
  type BridgeLifecycle,
  type LifecycleFactory,
} from "./lifecycle.js";
import {
  connectAgentBridge,
  type AgentBridge,
  type BridgeClientInfo,
  type BridgeConnectionState,
  type BridgeTool,
} from "./browser.js";

export type {
  AgentBridge,
  BridgeClientInfo,
  BridgeConnectionState,
  BridgeTool,
} from "./browser.js";

export type AgentBridgeFactory = typeof connectAgentBridge;

export interface AgentBridgeProviderProps {
  readonly tools: readonly BridgeTool<unknown>[];
  readonly enabled?: boolean;
  readonly bridgeFactory?: AgentBridgeFactory;
  readonly children: ReactNode;
}

export interface AgentBridgeContextValue {
  readonly state: BridgeConnectionState;
  readonly connect: (pairingLink: string) => Promise<void>;
  readonly disconnect: () => void;
}

const AgentBridgeContext = createContext<AgentBridgeContextValue | undefined>(
  undefined,
);

export function AgentBridgeProvider({
  tools,
  enabled = true,
  bridgeFactory = connectAgentBridge,
  children,
}: AgentBridgeProviderProps) {
  const lifecycleRef = useRef<BridgeLifecycle | undefined>(undefined);
  if (!lifecycleRef.current) {
    lifecycleRef.current = createBridgeLifecycle({
      tools,
      enabled,
      bridgeFactory,
    });
  }
  const lifecycle = lifecycleRef.current;
  const snapshot = useSyncExternalStore(
    lifecycle.subscribe,
    lifecycle.getSnapshot,
    lifecycle.getSnapshot,
  );
  const appliedToolsRef = useRef(tools);
  const appliedFactoryRef = useRef<LifecycleFactory>(bridgeFactory);

  useEffect(() => {
    lifecycle.setEnabled(enabled);
  }, [enabled, lifecycle]);

  useEffect(() => {
    if (appliedFactoryRef.current === bridgeFactory) return;
    appliedFactoryRef.current = bridgeFactory;
    lifecycle.setFactory(bridgeFactory);
  }, [bridgeFactory, lifecycle]);

  useEffect(() => {
    if (appliedToolsRef.current === tools) return;
    appliedToolsRef.current = tools;
    void lifecycle.setTools(tools).catch(() => undefined);
  }, [lifecycle, tools]);

  useEffect(() => {
    lifecycle.start();
    return () => lifecycle.stop();
  }, [lifecycle]);

  const connect = useCallback(
    (pairingLink: string) => lifecycle.connect(pairingLink),
    [lifecycle],
  );
  const disconnect = useCallback(() => lifecycle.disconnect(), [lifecycle]);
  const value = useMemo(
    () => ({ state: snapshot.connection, connect, disconnect }),
    [connect, disconnect, snapshot.connection],
  );

  return (
    <AgentBridgeContext.Provider value={value}>
      {children}
    </AgentBridgeContext.Provider>
  );
}

export function useAgentBridge(): AgentBridgeContextValue {
  const value = useContext(AgentBridgeContext);
  if (!value) {
    throw new Error("useAgentBridge must be used inside AgentBridgeProvider.");
  }
  return value;
}
