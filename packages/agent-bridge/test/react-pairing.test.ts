import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgentBridge, BridgeConnectionState } from "../src/browser.js";
import type { AgentBridgeFactory } from "../src/react.js";

const dom = new Window({
  url: "https://react.example.test/editor#keep=1&bridgePort=1234&bridgeToken=secret",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});

vi.resetModules();
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { AgentBridgeProvider } = await import("../src/react.js");

it("scrubs the initial pairing fragment and attempts it once", async () => {
  const calls: string[] = [];
  const factory: AgentBridgeFactory = ({ onStateChange }) => {
    let state: BridgeConnectionState = { status: "disconnected" };
    const bridge: AgentBridge = {
      async connect(link) {
        calls.push(link);
        const error = {
          status: "error" as const,
          error: { code: "not_connected", message: "failed" },
        };
        state = error;
        onStateChange?.(error);
        throw new Error("failed");
      },
      disconnect() {
        state = { status: "disconnected" };
      },
      getState() {
        return state;
      },
      async updateTools() {},
    };
    return bridge;
  };
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(AgentBridgeProvider, {
        bridgeFactory: factory,
        tools: [],
        children: React.createElement("div"),
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain("bridgeToken=secret");
  expect(dom.window.location.hash).toBe("#keep=1");
  root.unmount();
});
