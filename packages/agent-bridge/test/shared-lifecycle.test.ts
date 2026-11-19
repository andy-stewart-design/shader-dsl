import { Window } from "happy-dom";
import { expect, it, vi } from "vitest";
import type { AgentBridge, BridgeConnectionState } from "../src/browser.js";
import type { AgentBridgeFactory } from "../src/react.js";

const dom = new Window({
  url: "https://shared.example.test/editor#bridgePort=1234&bridgeToken=secret",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
});

vi.resetModules();
const { createBridgeLifecycle } = await import("../src/lifecycle.js");
const { AgentBridgeProvider } = await import("../src/react.js");
const { createAgentBridgeStore } = await import("../src/zustand.js");
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");

it("shares the pairing slot without disabled stores or abandoned renders claiming it", async () => {
  const calls: string[] = [];
  const factory: AgentBridgeFactory = ({ onStateChange }) => {
    let state: BridgeConnectionState = { status: "disconnected" };
    const bridge: AgentBridge = {
      connect: async (link) => {
        calls.push(link);
        state = {
          status: "connected",
          sessionId: "session",
          catalogVersion: 1,
        };
        onStateChange?.(state);
      },
      disconnect: () => {
        state = { status: "disconnected" };
      },
      getState: () => state,
      updateTools: async () => undefined,
    };
    return bridge;
  };

  const cancelledLifecycle = createBridgeLifecycle({
    tools: [],
    enabled: true,
    bridgeFactory: factory,
  });
  cancelledLifecycle.start();
  cancelledLifecycle.stop();
  createAgentBridgeStore({ bridgeFactory: factory });
  React.createElement(AgentBridgeProvider, {
    bridgeFactory: factory,
    tools: [],
    children: null,
  });

  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(AgentBridgeProvider, {
        bridgeFactory: factory,
        tools: [],
        children: null,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain("bridgeToken=secret");
  expect(dom.window.location.hash).toBe("");
  root.unmount();
});

it("rejects a second synchronous connect without replacing the first link", async () => {
  const calls: string[] = [];
  const factory: AgentBridgeFactory = ({ onStateChange }) => {
    let state: BridgeConnectionState = { status: "disconnected" };
    const bridge: AgentBridge = {
      connect: async (link) => {
        calls.push(link);
        state = {
          status: "connected",
          sessionId: "session",
          catalogVersion: 1,
        };
        onStateChange?.(state);
      },
      disconnect: () => {
        state = { status: "disconnected" };
      },
      getState: () => state,
      updateTools: async () => undefined,
    };
    return bridge;
  };
  const store = createAgentBridgeStore({
    enabled: true,
    bridgeFactory: factory,
  });

  const first = store.getState().connect("one");
  const second = store.getState().connect("two");
  await expect(second).rejects.toThrow("already in progress");
  await first;
  expect(calls).toEqual(["one"]);
});

it("cleans up a bridge whose initial state cannot be read", async () => {
  let disconnects = 0;
  const factory: AgentBridgeFactory = () => ({
    connect: async () => undefined,
    disconnect: () => {
      disconnects += 1;
    },
    getState: () => {
      throw new Error("state unavailable");
    },
    updateTools: async () => undefined,
  });
  const store = createAgentBridgeStore({
    enabled: true,
    bridgeFactory: factory,
  });

  await vi.waitFor(() => {
    expect(store.getState().connection).toEqual({
      status: "error",
      error: {
        code: "initialization_failed",
        message: "bridge initialization failed",
      },
    });
  });
  expect(disconnects).toBe(1);
});
