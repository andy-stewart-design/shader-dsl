import { afterEach, describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  AgentBridge,
  BridgeConnectionState,
  BridgeTool,
} from "../src/browser.js";
import {
  AgentBridgeProvider,
  useAgentBridge,
  type AgentBridgeFactory,
} from "../src/react.js";

const dom = new Window({ url: "https://react.example.test/editor" });
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

type Instance = {
  bridge: AgentBridge;
  state: BridgeConnectionState;
  tools: readonly BridgeTool<unknown>[];
  connectCalls: string[];
  disconnectCalls: number;
  updateCalls: readonly BridgeTool<unknown>[][];
  resolveConnect: (() => void) | undefined;
  rejectConnect: ((error: Error) => void) | undefined;
  resolveUpdate: (() => void) | undefined;
};

type Ownership = { active: Instance | undefined };

function makeFactory(
  options: { holdConnect?: boolean; failConnect?: boolean } = {},
  ownership: Ownership = { active: undefined },
) {
  const instances: Instance[] = [];
  const factory: AgentBridgeFactory = ({ tools, onStateChange }) => {
    let instance: Instance;
    const initialState: BridgeConnectionState = ownership.active
      ? {
          status: "error",
          error: {
            code: "owner_conflict",
            message: "another bridge controller owns this page",
          },
        }
      : { status: "disconnected" };
    const publish = (state: BridgeConnectionState) => {
      instance.state = state;
      onStateChange?.(state);
    };
    const bridge: AgentBridge = {
      async connect(link) {
        instance.connectCalls.push(link);
        publish({ status: "connecting" });
        if (options.failConnect) {
          const error = new Error("initial connection failed");
          publish({
            status: "error",
            error: { code: "not_connected", message: error.message },
          });
          throw error;
        }
        await new Promise<void>((resolve, reject) => {
          instance.resolveConnect = () => {
            instance.resolveConnect = undefined;
            publish({
              status: "connected",
              sessionId: "test-session",
              catalogVersion: 1,
            });
            resolve();
          };
          instance.rejectConnect = reject;
          if (!options.holdConnect) instance.resolveConnect();
        });
      },
      disconnect() {
        instance.disconnectCalls += 1;
        if (ownership.active === instance) ownership.active = undefined;
        publish({ status: "disconnected" });
      },
      getState() {
        return instance.state;
      },
      updateTools(nextTools) {
        instance.updateCalls = [...instance.updateCalls, [...nextTools]];
        return new Promise<void>((resolve) => {
          instance.resolveUpdate = resolve;
        });
      },
    };
    instance = {
      bridge,
      state: initialState,
      tools,
      connectCalls: [],
      disconnectCalls: 0,
      updateCalls: [],
      resolveConnect: undefined,
      rejectConnect: undefined,
      resolveUpdate: undefined,
    };
    instances.push(instance);
    if (!ownership.active) ownership.active = instance;
    return bridge;
  };
  return { factory, instances };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function ConnectionProbe({
  onBridge,
}: {
  onBridge: (bridge: ReturnType<typeof useAgentBridge>) => void;
}) {
  const bridge = useAgentBridge();
  useEffect(() => onBridge(bridge), [bridge, onBridge]);
  return null;
}

function renderProvider(
  factory: AgentBridgeFactory,
  props: { enabled?: boolean; tools?: readonly BridgeTool<unknown>[] } = {},
) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const tools = props.tools ?? [];
  const render = (enabled = props.enabled ?? true, nextTools = tools) =>
    root.render(
      <AgentBridgeProvider
        bridgeFactory={factory}
        enabled={enabled}
        tools={nextTools}
      >
        <ConnectionProbe onBridge={() => undefined} />
      </AgentBridgeProvider>,
    );
  render(props.enabled ?? true, tools);
  return { root, render };
}

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount();
  dom.window.history.replaceState(
    null,
    "",
    "https://react.example.test/editor",
  );
});

describe("mounted React adapter lifecycle", () => {
  it("creates one live bridge under StrictMode and disconnects synchronously on unmount", async () => {
    const { factory, instances } = makeFactory();
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        <StrictMode>
          <AgentBridgeProvider bridgeFactory={factory} tools={[]}>
            <div />
          </AgentBridgeProvider>
        </StrictMode>,
      );
      await Promise.resolve();
    });
    expect(instances).toHaveLength(1);
    expect(
      instances.filter((instance) => instance.disconnectCalls === 0),
    ).toHaveLength(1);
    root.unmount();
    expect(instances[0]!.disconnectCalls).toBe(1);
  });

  it("releases an old owner before same-commit replacement initializes", async () => {
    const ownership: Ownership = { active: undefined };
    const first = makeFactory({}, ownership);
    const second = makeFactory({}, ownership);
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        <AgentBridgeProvider bridgeFactory={first.factory} tools={[]}>
          <div />
        </AgentBridgeProvider>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      root.render(
        <AgentBridgeProvider
          key="replacement"
          bridgeFactory={second.factory}
          tools={[]}
        >
          <div />
        </AgentBridgeProvider>,
      );
      await Promise.resolve();
    });
    expect(first.instances[0]!.disconnectCalls).toBe(1);
    expect(second.instances).toHaveLength(1);
    expect(second.instances[0]!.state.status).toBe("disconnected");
  });

  it("does not initialize a disabled provider after an explicit disconnect", async () => {
    const { factory, instances } = makeFactory();
    let controls: ReturnType<typeof useAgentBridge> | undefined;
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    const render = (enabled: boolean) =>
      root.render(
        <AgentBridgeProvider
          bridgeFactory={factory}
          enabled={enabled}
          tools={[]}
        >
          <ConnectionProbe
            onBridge={(value) => {
              controls = value;
            }}
          />
        </AgentBridgeProvider>,
      );
    await act(async () => render(false));
    await controls?.connect("pending-link");
    controls?.disconnect();
    await act(async () => render(true));
    await settle();
    expect(instances).toHaveLength(0);
  });

  it("supports enable/disable and manual disconnect followed by a fresh bridge", async () => {
    const { factory, instances } = makeFactory();
    const view = renderProvider(factory, { enabled: false });
    roots.push(view.root);
    await settle();
    expect(instances).toHaveLength(0);
    view.render(true);
    await settle();
    expect(instances).toHaveLength(1);
    view.render(false);
    await settle();
    expect(instances[0]!.disconnectCalls).toBe(1);
    view.render(true);
    await settle();
    expect(instances).toHaveLength(2);
  });

  it("clears a queued disabled link when the provider unmounts", async () => {
    const { factory, instances } = makeFactory();
    let controls: ReturnType<typeof useAgentBridge> | undefined;
    const firstRoot = createRoot(document.createElement("div"));
    const secondRoot = createRoot(document.createElement("div"));
    roots.push(firstRoot, secondRoot);
    await act(async () => {
      firstRoot.render(
        <AgentBridgeProvider bridgeFactory={factory} enabled={false} tools={[]}>
          <ConnectionProbe
            onBridge={(value) => {
              controls = value;
            }}
          />
        </AgentBridgeProvider>,
      );
    });
    await controls?.connect("queued-link");
    firstRoot.unmount();
    await Promise.resolve();
    await act(async () => {
      secondRoot.render(
        <AgentBridgeProvider bridgeFactory={factory} tools={[]}>
          <div />
        </AgentBridgeProvider>,
      );
      await Promise.resolve();
    });
    await settle();
    expect(instances).toHaveLength(1);
    expect(instances[0]!.connectCalls).toEqual([]);
  });

  it("manual disconnect and reconnect create a fresh bridge", async () => {
    const { factory, instances } = makeFactory();
    let controls: ReturnType<typeof useAgentBridge> | undefined;
    const root = createRoot(document.createElement("div"));
    roots.push(root);
    await act(async () => {
      root.render(
        <AgentBridgeProvider bridgeFactory={factory} tools={[]}>
          <ConnectionProbe
            onBridge={(value) => {
              controls = value;
            }}
          />
        </AgentBridgeProvider>,
      );
      await Promise.resolve();
    });
    await settle();
    controls?.disconnect();
    await controls?.connect("manual-link");
    await settle();
    expect(instances).toHaveLength(2);
    expect(instances[0]!.disconnectCalls).toBe(1);
  });

  it("replaces the bridge when the factory changes", async () => {
    const ownership: Ownership = { active: undefined };
    const first = makeFactory({}, ownership);
    const second = makeFactory({}, ownership);
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        <AgentBridgeProvider
          bridgeFactory={first.factory}
          tools={[]}
          children={null}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      root.render(
        <AgentBridgeProvider
          bridgeFactory={second.factory}
          tools={[]}
          children={null}
        />,
      );
      await Promise.resolve();
    });
    expect(first.instances[0]!.disconnectCalls).toBe(1);
    expect(second.instances).toHaveLength(1);
  });

  it("uses the latest tools after connecting and coalesces a catalog update", async () => {
    const { factory, instances } = makeFactory({ holdConnect: true });
    const initialTools: readonly BridgeTool<unknown>[] = [];
    const next: readonly BridgeTool<unknown>[] = [
      {
        name: "one",
        description: "one",
        inputSchema: { type: "object" },
        handler: () => ({ ok: true }),
      },
    ];
    const latest: readonly BridgeTool<unknown>[] = [
      {
        name: "two",
        description: "two",
        inputSchema: { type: "object" },
        handler: () => ({ ok: true }),
      },
    ];
    let controls: ReturnType<typeof useAgentBridge> | undefined;
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        <AgentBridgeProvider bridgeFactory={factory} tools={initialTools}>
          <ConnectionProbe
            onBridge={(value) => {
              controls = value;
            }}
          />
        </AgentBridgeProvider>,
      );
      await Promise.resolve();
    });
    await settle();
    const instance = instances[0]!;
    const connecting = controls?.connect("link");
    await act(async () => {
      root.render(
        <AgentBridgeProvider
          bridgeFactory={factory}
          tools={next}
          children={null}
        />,
      );
      await Promise.resolve();
    });
    expect(instance.updateCalls).toHaveLength(0);
    instance.resolveConnect?.();
    await settle();
    await connecting;
    expect(instance.updateCalls[0]).toEqual(next);
    instance.resolveUpdate?.();
    await act(async () => {
      root.render(
        <AgentBridgeProvider
          bridgeFactory={factory}
          tools={latest}
          children={null}
        />,
      );
      await Promise.resolve();
    });
    await settle();
    expect(instance.updateCalls[1]).toEqual(latest);
  });
});
