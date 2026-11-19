import { createStore } from "zustand/vanilla";
import { createBridgeLifecycle } from "./lifecycle.js";
import {
  connectAgentBridge,
  type BridgeConnectionState,
  type BridgeTool,
} from "./browser.js";

export type { BridgeConnectionState, BridgeTool } from "./browser.js";

export type AgentBridgeFactory = typeof connectAgentBridge;

export interface AgentBridgeStoreOptions {
  readonly tools?: readonly BridgeTool<unknown>[];
  readonly enabled?: boolean;
  readonly bridgeFactory?: AgentBridgeFactory;
  /** A pairing link for non-browser hosts and isolated tests. */
  readonly initialPairingLink?: string;
}

export type AgentBridgeStore = {
  connection: BridgeConnectionState;
  enabled: boolean;
  connect(pairingLink: string): Promise<void>;
  disconnect(): void;
  setEnabled(enabled: boolean): void;
  /**
   * Replace the local catalog. While disconnected or connecting this resolves
   * when the catalog is queued; while connected it resolves after acknowledgement.
   */
  setTools(tools: readonly BridgeTool<unknown>[]): Promise<void>;
};

export function createAgentBridgeStore(options: AgentBridgeStoreOptions = {}) {
  const lifecycle = createBridgeLifecycle({
    tools: options.tools ?? [],
    enabled: options.enabled === true,
    bridgeFactory: options.bridgeFactory,
    initialPairingLink: options.initialPairingLink,
  });

  const store = createStore<AgentBridgeStore>((set) => {
    lifecycle.subscribe(() => {
      const next = lifecycle.getSnapshot();
      set({ connection: next.connection, enabled: next.enabled });
    });

    return {
      connection: lifecycle.getSnapshot().connection,
      enabled: lifecycle.getSnapshot().enabled,
      connect: (pairingLink) => lifecycle.connect(pairingLink),
      disconnect: () => lifecycle.disconnect(),
      setEnabled: (enabled) => lifecycle.setEnabled(enabled),
      setTools: (tools) => lifecycle.setTools(tools),
    };
  });

  lifecycle.start();
  return store;
}
