import { createAgentBridgeStore } from "app-mcp/zustand";
import { useStore } from "zustand";

export const agentStore = createAgentBridgeStore();

export const useAgentConnectionState = () =>
  useStore(agentStore, (state) => state.connection);
export const useAgentEnabled = () =>
  useStore(agentStore, (state) => state.enabled);
export const useAgentActions = () =>
  useStore(agentStore, (state) => state.actions);
