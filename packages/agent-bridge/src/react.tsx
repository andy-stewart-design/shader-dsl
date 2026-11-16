import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  connectAgentBridge,
  consumePairingLink,
  type AgentBridge,
  type BridgeConnectionState,
  type BridgeTool,
} from "./browser.js";

export type {
  AgentBridge,
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

// Consume and scrub the one-time credential while this module is evaluated.
let initialPairingLink = consumePairingLink();
const AgentBridgeContext = createContext<AgentBridgeContextValue | undefined>(
  undefined,
);

/**
 * Own one browser bridge for this mounted provider. Initialization is deferred
 * one microtask so effect cleanup can release a previous owner before another
 * provider creates its bridge. This also makes StrictMode's first setup a
 * cancellable no-op rather than a second bridge lifetime.
 */
export function AgentBridgeProvider({
  tools,
  enabled = true,
  bridgeFactory = connectAgentBridge,
  children,
}: AgentBridgeProviderProps) {
  const bridgeRef = useRef<AgentBridge | undefined>(undefined);
  const pendingLinkRef = useRef<string | undefined>(initialPairingLink);
  const mountedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const bridgeFactoryPropRef = useRef(bridgeFactory);
  const blockedRef = useRef(false);
  const initTaskRef = useRef<{ cancelled: boolean } | undefined>(undefined);
  const toolsRef = useRef(tools);
  const syncedToolsRef = useRef<readonly BridgeTool<unknown>[] | undefined>(
    undefined,
  );
  const catalogUpdateRef = useRef<Promise<void> | undefined>(undefined);
  const [state, setState] = useState<BridgeConnectionState>({
    status: "disconnected",
  });

  enabledRef.current = enabled;
  bridgeFactoryPropRef.current = bridgeFactory;
  toolsRef.current = tools;

  const syncTools = useCallback((bridge: AgentBridge) => {
    if (
      bridgeRef.current !== bridge ||
      bridge.getState().status !== "connected" ||
      syncedToolsRef.current === toolsRef.current ||
      catalogUpdateRef.current
    )
      return;

    const nextTools = toolsRef.current;
    const update = Promise.resolve()
      .then(() => bridge.updateTools(nextTools))
      .then(() => {
        if (bridgeRef.current === bridge) syncedToolsRef.current = nextTools;
      })
      .catch(() => {
        // A disconnected bridge retries after it reconnects. A connected
        // bridge rejected this catalog, so do not retry it forever.
        if (
          bridgeRef.current === bridge &&
          bridge.getState().status === "connected"
        )
          syncedToolsRef.current = nextTools;
      })
      .finally(() => {
        if (catalogUpdateRef.current === update)
          catalogUpdateRef.current = undefined;
        if (
          bridgeRef.current === bridge &&
          syncedToolsRef.current !== toolsRef.current
        )
          syncTools(bridge);
      });
    catalogUpdateRef.current = update;
  }, []);

  const dispose = useCallback((expected?: AgentBridge) => {
    if (expected && bridgeRef.current !== expected) return;
    const bridge = bridgeRef.current;
    bridgeRef.current = undefined;
    syncedToolsRef.current = undefined;
    catalogUpdateRef.current = undefined;
    if (bridge) bridge.disconnect();
    setState({ status: "disconnected" });
  }, []);

  const cancelInitialization = useCallback(() => {
    const task = initTaskRef.current;
    if (task) task.cancelled = true;
    initTaskRef.current = undefined;
  }, []);

  const initialize = useCallback(() => {
    if (
      !mountedRef.current ||
      !enabledRef.current ||
      blockedRef.current ||
      bridgeRef.current
    )
      return;

    const factory = bridgeFactoryPropRef.current;
    let created: AgentBridge | undefined;
    try {
      created = factory({
        tools: toolsRef.current,
        onStateChange: (next) => {
          if (!created || bridgeRef.current !== created) return;
          setState(next);
          if (next.status === "connected") syncTools(created);
        },
      });
      bridgeRef.current = created;
      syncedToolsRef.current = toolsRef.current;
      setState(created.getState());

      const pairingLink = pendingLinkRef.current;
      pendingLinkRef.current = undefined;
      if (pairingLink) {
        void created.connect(pairingLink).catch(() => {
          // The bridge publishes a redacted error state. Never log or echo the
          // one-time pairing credential, and never retry a failed initial link.
        });
      }
    } catch {
      setState({
        status: "error",
        error: {
          code: "initialization_failed",
          message: "bridge initialization failed",
        },
      });
    }
  }, [syncTools]);

  const scheduleInitialization = useCallback(() => {
    if (
      !mountedRef.current ||
      !enabledRef.current ||
      blockedRef.current ||
      bridgeRef.current ||
      initTaskRef.current
    )
      return;

    const task = { cancelled: false };
    initTaskRef.current = task;
    queueMicrotask(() => {
      if (initTaskRef.current === task) initTaskRef.current = undefined;
      if (
        task.cancelled ||
        !mountedRef.current ||
        !enabledRef.current ||
        blockedRef.current
      )
        return;
      initialize();
    });
  }, [initialize]);

  useEffect(() => {
    mountedRef.current = true;
    if (!initialPairingLink || pendingLinkRef.current === initialPairingLink)
      initialPairingLink = undefined;

    if (!enabled) {
      cancelInitialization();
      dispose();
    } else {
      scheduleInitialization();
    }

    return () => {
      mountedRef.current = false;
      cancelInitialization();
      dispose();
      queueMicrotask(() => {
        if (!mountedRef.current) pendingLinkRef.current = undefined;
      });
    };
  }, [
    bridgeFactory,
    cancelInitialization,
    dispose,
    enabled,
    scheduleInitialization,
  ]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (bridge) syncTools(bridge);
  }, [tools, syncTools]);

  const connect = useCallback(
    async (pairingLink: string) => {
      const trimmed = pairingLink.trim();
      if (!trimmed) throw new Error("A pairing link is required.");

      blockedRef.current = false;
      pendingLinkRef.current = trimmed;
      if (!enabledRef.current) return;

      const bridge = bridgeRef.current;
      if (!bridge) {
        scheduleInitialization();
        return;
      }
      pendingLinkRef.current = undefined;
      await bridge.connect(trimmed);
    },
    [scheduleInitialization],
  );

  const disconnect = useCallback(() => {
    blockedRef.current = true;
    pendingLinkRef.current = undefined;
    cancelInitialization();
    dispose();
  }, [cancelInitialization, dispose]);

  const value = useMemo(
    () => ({ state, connect, disconnect }),
    [connect, disconnect, state],
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
