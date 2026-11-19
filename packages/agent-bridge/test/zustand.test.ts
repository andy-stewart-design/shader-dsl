import { describe, expect, it, vi } from "vitest";
import type { AgentBridge, BridgeConnectionState } from "../src/browser.js";
import {
  createAgentBridgeStore,
  type AgentBridgeFactory,
} from "../src/zustand.js";

function fakeFactory(
  calls: string[],
  updates: (readonly unknown[])[] = [],
): AgentBridgeFactory {
  return ({ tools, onStateChange }) => {
    let state: BridgeConnectionState = { status: "disconnected" };
    const bridge: AgentBridge = {
      async connect(link) {
        calls.push(link);
        state = {
          status: "connected",
          sessionId: `session-${calls.length}`,
          catalogVersion: 1,
          client: { name: "client", version: "1" },
          connectedAt: 10,
          lastConnectedAt: 20,
        };
        onStateChange?.(state);
      },
      disconnect() {
        state = { status: "disconnected" };
        onStateChange?.(state);
      },
      getState() {
        return state;
      },
      async updateTools(nextTools) {
        updates.push(nextTools);
      },
    };
    expect(tools).toBeDefined();
    return bridge;
  };
}

describe("Zustand adapter", () => {
  it("does not create or connect a bridge by default", () => {
    const factory = vi.fn(fakeFactory([]));
    const store = createAgentBridgeStore({ bridgeFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    expect(store.getState().enabled).toBe(false);
    expect(store.getState().connection).toEqual({ status: "disconnected" });
  });

  it("queues disabled links and initializes once when enabled", async () => {
    const calls: string[] = [];
    const factory = vi.fn(fakeFactory(calls));
    const store = createAgentBridgeStore({ bridgeFactory: factory });
    await store.getState().connect(" link-one ");
    expect(calls).toEqual([]);
    store.getState().setEnabled(true);
    await vi.waitFor(() => expect(calls).toEqual(["link-one"]));
    expect(store.getState().connection).toMatchObject({
      status: "connected",
      client: { name: "client", version: "1" },
      connectedAt: 10,
      lastConnectedAt: 20,
    });
  });

  it("cancels a microtask initialization and creates a fresh controller", async () => {
    const factories: string[][] = [];
    const factory: AgentBridgeFactory = (options) => {
      const calls: string[] = [];
      factories.push(calls);
      return fakeFactory(calls)(options);
    };
    const store = createAgentBridgeStore({ bridgeFactory: factory });
    store.getState().setEnabled(true);
    store.getState().setEnabled(false);
    await Promise.resolve();
    expect(factories).toHaveLength(0);
    store.getState().setEnabled(true);
    await vi.waitFor(() => expect(factories).toHaveLength(1));
    store.getState().disconnect();
    store.getState().setEnabled(true);
    expect(factories).toHaveLength(1);
    await store.getState().connect("fresh");
    expect(factories).toHaveLength(2);
  });

  it("rejects an in-flight initial connect on disable without replaying it", async () => {
    const calls: string[] = [];
    let factories = 0;
    let release!: () => void;
    const connection = new Promise<void>((resolve) => {
      release = resolve;
    });
    const factory: AgentBridgeFactory = ({ onStateChange }) => {
      factories += 1;
      const factoryNumber = factories;
      let state: BridgeConnectionState = { status: "disconnected" };
      return {
        connect(link) {
          calls.push(link);
          return connection.then(() => {
            state = {
              status: "connected",
              sessionId: `late-${factoryNumber}`,
              catalogVersion: 1,
            };
            onStateChange?.(state);
          });
        },
        disconnect() {
          // Deliberately do not settle connect().
        },
        getState() {
          return state;
        },
        async updateTools() {},
      };
    };
    const store = createAgentBridgeStore({ bridgeFactory: factory });
    store.getState().setEnabled(true);
    const pending = store.getState().connect("delayed");
    await vi.waitFor(() => expect(calls).toEqual(["delayed"]));
    store.getState().setEnabled(false);
    await expect(pending).rejects.toThrow("cancelled");
    release();
    await Promise.resolve();
    expect(calls).toEqual(["delayed"]);
    expect(store.getState().connection).toEqual({ status: "disconnected" });
    store.getState().setEnabled(true);
    await store.getState().connect("fresh");
    expect(calls).toEqual(["delayed", "fresh"]);
    expect(store.getState().connection).toMatchObject({
      status: "connected",
      sessionId: "late-2",
    });
  });

  it("preserves disabled pairing through lifecycle toggles but not explicit disconnect", async () => {
    const calls: string[] = [];
    const store = createAgentBridgeStore({
      initialPairingLink: "initial",
      bridgeFactory: fakeFactory(calls),
    });
    store.getState().setEnabled(true);
    store.getState().setEnabled(false);
    store.getState().setEnabled(true);
    await vi.waitFor(() => expect(calls).toEqual(["initial"]));

    store.getState().disconnect();
    store.getState().setEnabled(false);
    store.getState().setEnabled(true);
    await Promise.resolve();
    expect(calls).toEqual(["initial"]);
    await store.getState().connect("replacement");
    expect(calls).toEqual(["initial", "replacement"]);
  });

  it("preserves active state after a rejected redundant connect", async () => {
    const calls: string[] = [];
    const updates: (readonly unknown[])[] = [];
    const factory: AgentBridgeFactory = ({ tools, onStateChange }) => {
      let state: BridgeConnectionState = { status: "disconnected" };
      return {
        async connect(link) {
          calls.push(link);
          if (state.status === "connected") throw new Error("redundant");
          state = {
            status: "connected",
            sessionId: "session",
            catalogVersion: 1,
            client: { name: "client", version: "1" },
            connectedAt: 10,
            lastConnectedAt: 20,
          };
          onStateChange?.(state);
        },
        disconnect() {
          state = { status: "disconnected" };
        },
        getState() {
          return state;
        },
        async updateTools(nextTools) {
          updates.push(nextTools);
        },
      };
    };
    const store = createAgentBridgeStore({
      enabled: true,
      tools: [],
      bridgeFactory: factory,
    });
    await store.getState().connect("first");
    const before = store.getState().connection;
    await expect(store.getState().connect("second")).rejects.toThrow(
      "redundant",
    );
    expect(store.getState().connection).toEqual(before);
    await store.getState().setTools([
      {
        name: "tool",
        description: "",
        inputSchema: {},
        handler: async () => null,
      },
    ]);
    expect(updates).toHaveLength(1);
    expect(calls).toEqual(["first", "second"]);
  });

  it("does not let a stale catalog failure reject a replacement bridge", async () => {
    let bridgeNumber = 0;
    let rejectOld!: (error: Error) => void;
    let resolveNew!: () => void;
    const factory: AgentBridgeFactory = ({ onStateChange }) => {
      bridgeNumber += 1;
      const number = bridgeNumber;
      let state: BridgeConnectionState = { status: "disconnected" };
      return {
        async connect() {
          state = {
            status: "connected",
            sessionId: `session-${number}`,
            catalogVersion: 1,
          };
          onStateChange?.(state);
        },
        disconnect() {},
        getState() {
          return state;
        },
        updateTools() {
          if (number === 1)
            return new Promise<void>((_resolve, reject) => {
              rejectOld = reject;
            });
          return new Promise<void>((resolve) => {
            resolveNew = resolve;
          });
        },
      };
    };
    const store = createAgentBridgeStore({
      enabled: true,
      bridgeFactory: factory,
    });
    await store.getState().connect("first");
    const oldUpdate = store.getState().setTools([
      {
        name: "old",
        description: "",
        inputSchema: {},
        handler: async () => null,
      },
    ]);
    await vi.waitFor(() => expect(rejectOld).toBeTypeOf("function"));
    store.getState().disconnect();
    await expect(oldUpdate).rejects.toThrow("bridge disconnected");

    const replacement = store.getState().connect("replacement");
    await replacement;
    const newUpdate = store.getState().setTools([
      {
        name: "new",
        description: "",
        inputSchema: {},
        handler: async () => null,
      },
    ]);
    await vi.waitFor(() => expect(resolveNew).toBeTypeOf("function"));
    rejectOld(new Error("old update failed"));
    let settled = false;
    void newUpdate.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveNew();
    await expect(newUpdate).resolves.toBeUndefined();
  });

  it("coalesces connected catalog updates and rejects invalid replacements", async () => {
    const calls: string[] = [];
    const updates: (readonly unknown[])[] = [];
    const store = createAgentBridgeStore({
      enabled: true,
      bridgeFactory: fakeFactory(calls, updates),
    });
    await store.getState().connect("pairing");
    const first = [
      {
        name: "first",
        description: "",
        inputSchema: {},
        handler: async () => null,
      },
    ];
    const second = [
      {
        name: "second",
        description: "",
        inputSchema: {},
        handler: async () => null,
      },
    ];
    const firstUpdate = store.getState().setTools(first);
    const secondUpdate = store.getState().setTools(second);
    await Promise.all([firstUpdate, secondUpdate]);
    expect(updates).toHaveLength(2);
    expect(updates[1]?.[0]).toMatchObject({ name: "second" });
    await expect(
      store.getState().setTools([
        {
          name: "bad name",
          description: "",
          inputSchema: {},
          handler: async () => null,
        },
      ]),
    ).rejects.toThrow("invalid catalog");
  });
});
