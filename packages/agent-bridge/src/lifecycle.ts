import {
  connectAgentBridge,
  consumePairingLink,
  type AgentBridge,
  type BridgeConnectionState,
  type BridgeTool,
} from "./browser.js";
import { validateCatalogTools } from "./schema.js";

export type LifecycleFactory = typeof connectAgentBridge;

type LifecycleSnapshot = {
  readonly connection: BridgeConnectionState;
  readonly enabled: boolean;
};

type Listener = () => void;

type InitTask = {
  cancelled: boolean;
  connectRequested: boolean;
  connectStarted: boolean;
  promise: Promise<AgentBridge | undefined>;
  resolve: (bridge: AgentBridge | undefined) => void;
  reject: (error: Error) => void;
};

type ConnectAttempt = {
  reject: (error: Error) => void;
};

type SyncWaiter = {
  bridge: AgentBridge;
  generation: number;
  revision: number;
  resolve: () => void;
  reject: (error: Error) => void;
};

type CatalogSync = {
  bridge: AgentBridge;
  generation: number;
  revision: number;
};

// This is intentionally the only adapter-level pairing read.  Managers claim
// the slot when they are activated, not when they are constructed.
let initialPairingLink = consumePairingLink();

export type BridgeLifecycle = {
  getSnapshot(): LifecycleSnapshot;
  subscribe(listener: Listener): () => void;
  start(): void;
  stop(): void;
  setEnabled(enabled: boolean): void;
  setTools(tools: readonly BridgeTool<unknown>[]): Promise<void>;
  setFactory(factory: LifecycleFactory): void;
  connect(pairingLink: string): Promise<void>;
  disconnect(): void;
};

export function createBridgeLifecycle(options: {
  readonly tools: readonly BridgeTool<unknown>[];
  readonly enabled: boolean;
  readonly bridgeFactory?: LifecycleFactory;
  readonly initialPairingLink?: string;
}): BridgeLifecycle {
  validateTools(options.tools);

  let desiredTools = [...options.tools];
  let activeTools = [...options.tools];
  let desiredRevision = 0;
  let activeRevision = 0;
  let bridge: AgentBridge | undefined;
  let bridgeGeneration = 0;
  let generation = 0;
  let factory = options.bridgeFactory ?? connectAgentBridge;
  let enabled = options.enabled;
  let started = false;
  let blocked = false;
  let initialClaimed = false;
  let pendingLink = normalizeLink(options.initialPairingLink);
  let initTask: InitTask | undefined;
  let connectAttempt: ConnectAttempt | undefined;
  let syncInFlight: CatalogSync | undefined;
  const syncWaiters: SyncWaiter[] = [];
  const listeners = new Set<Listener>();
  let snapshot: LifecycleSnapshot = {
    connection: { status: "disconnected" },
    enabled,
  };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const publish = (connection: BridgeConnectionState) => {
    snapshot = { connection, enabled };
    notify();
  };

  const isActive = (targetBridge: AgentBridge, targetGeneration: number) =>
    bridge === targetBridge && bridgeGeneration === targetGeneration;

  const publishError = (code: string, message: string) => {
    publish({ status: "error", error: { code, message } });
  };

  const rejectSyncWaiters = (error: Error) => {
    const waiters = syncWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  };

  const settleSyncWaiters = (
    targetBridge: AgentBridge,
    targetGeneration: number,
    revision: number,
    error?: Error,
  ) => {
    for (let index = syncWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = syncWaiters[index];
      if (
        waiter &&
        waiter.bridge === targetBridge &&
        waiter.generation === targetGeneration &&
        waiter.revision <= revision
      ) {
        if (error) waiter.reject(error);
        else waiter.resolve();
        syncWaiters.splice(index, 1);
      }
    }
  };

  const readBridgeState = (targetBridge: AgentBridge) => {
    try {
      return targetBridge.getState();
    } catch {
      return undefined;
    }
  };

  const syncBridgeState = (
    targetBridge: AgentBridge,
    targetGeneration: number,
  ) => {
    if (!isActive(targetBridge, targetGeneration)) return undefined;
    const next = readBridgeState(targetBridge);
    if (!next) return undefined;
    publish(next);
    if (next.status === "connected") runCatalogSync();
    return next;
  };

  const handleConnectFailure = (
    targetBridge: AgentBridge,
    targetGeneration: number,
  ) => {
    const next = syncBridgeState(targetBridge, targetGeneration);
    if (
      isActive(targetBridge, targetGeneration) &&
      (!next || next.status === "disconnected")
    )
      publishError("connection_failed", "bridge connection failed");
  };

  const runCatalogSync = () => {
    if (syncInFlight || !bridge || snapshot.connection.status !== "connected")
      return;
    if (desiredRevision === activeRevision) {
      settleSyncWaiters(bridge, bridgeGeneration, activeRevision);
      return;
    }

    const targetBridge = bridge;
    const targetGeneration = bridgeGeneration;
    const targetRevision = desiredRevision;
    const targetTools = desiredTools;
    syncInFlight = {
      bridge: targetBridge,
      generation: targetGeneration,
      revision: targetRevision,
    };
    void Promise.resolve()
      .then(() => targetBridge.updateTools(targetTools))
      .then(() => {
        if (!isActive(targetBridge, targetGeneration)) return;
        activeTools = targetTools;
        activeRevision = targetRevision;
        settleSyncWaiters(targetBridge, targetGeneration, activeRevision);
      })
      .catch((error: unknown) => {
        if (!isActive(targetBridge, targetGeneration)) return;
        const reason =
          error instanceof Error ? error : new Error("catalog update failed");
        if (desiredRevision === targetRevision) {
          desiredTools = activeTools;
          desiredRevision = activeRevision;
        }
        settleSyncWaiters(
          targetBridge,
          targetGeneration,
          targetRevision,
          reason,
        );
      })
      .finally(() => {
        if (
          syncInFlight?.bridge === targetBridge &&
          syncInFlight.generation === targetGeneration &&
          syncInFlight.revision === targetRevision
        )
          syncInFlight = undefined;
        if (isActive(targetBridge, targetGeneration)) runCatalogSync();
      });
  };

  const dispose = () => {
    generation += 1;
    const attempt = connectAttempt;
    connectAttempt = undefined;
    attempt?.reject(new Error("bridge connection cancelled"));
    const task = initTask;
    if (task) {
      task.cancelled = true;
      initTask = undefined;
      task.reject(new Error("bridge initialization cancelled"));
    }
    const current = bridge;
    bridge = undefined;
    bridgeGeneration = 0;
    syncInFlight = undefined;
    rejectSyncWaiters(new Error("bridge disconnected"));
    if (current) {
      try {
        current.disconnect();
      } catch {
        // Disposal remains terminal even when a custom factory throws.
      }
    }
    publish({ status: "disconnected" });
  };

  const claimInitialLink = () => {
    if (initialClaimed) return;
    initialClaimed = true;
    const moduleLink = initialPairingLink;
    initialPairingLink = undefined;
    if (!pendingLink) pendingLink = moduleLink;
  };

  const initialize = async (
    task: InitTask,
  ): Promise<AgentBridge | undefined> => {
    if (task.cancelled || !started || !enabled || blocked) return undefined;
    const controllerGeneration = ++generation;
    let created: AgentBridge | undefined;
    try {
      created = factory({
        tools: desiredTools,
        onStateChange: (next) => {
          if (!created || !isActive(created, controllerGeneration)) return;
          publish(next);
          if (next.status === "connected") runCatalogSync();
        },
      });
    } catch {
      if (initTask === task && !task.cancelled)
        publishError("initialization_failed", "bridge initialization failed");
      throw new Error("bridge initialization failed");
    }
    if (task.cancelled || !started || !enabled || blocked) {
      try {
        created.disconnect();
      } catch {
        // Best effort for a factory created during cancellation.
      }
      return undefined;
    }

    const initialState = readBridgeState(created);
    if (!initialState) {
      try {
        created.disconnect();
      } catch {
        // Best effort for a factory whose initial state is unavailable.
      }
      if (initTask === task && !task.cancelled)
        publishError("initialization_failed", "bridge initialization failed");
      throw new Error("bridge initialization failed");
    }
    if (task.cancelled || !started || !enabled || blocked) {
      try {
        created.disconnect();
      } catch {
        // Best effort for a factory created during cancellation.
      }
      return undefined;
    }

    bridge = created;
    bridgeGeneration = controllerGeneration;
    activeTools = desiredTools;
    activeRevision = desiredRevision;
    publish(initialState);
    if (
      task.cancelled ||
      !started ||
      !enabled ||
      blocked ||
      !isActive(created, controllerGeneration)
    )
      return undefined;

    claimInitialLink();
    const link = pendingLink;
    pendingLink = undefined;
    if (link) {
      task.connectStarted = true;
      try {
        await created.connect(link);
      } catch (error: unknown) {
        if (!isActive(created, controllerGeneration) || task.cancelled)
          return undefined;
        handleConnectFailure(created, controllerGeneration);
        throw error instanceof Error
          ? error
          : new Error("bridge connection failed");
      }
      if (isActive(created, controllerGeneration))
        syncBridgeState(created, controllerGeneration);
    }
    return created;
  };

  const scheduleInitialization = (): Promise<AgentBridge | undefined> => {
    if (initTask) return initTask.promise;
    if (!started || !enabled || blocked || bridge)
      return Promise.resolve(bridge);

    const deferred = makeDeferred<AgentBridge | undefined>();
    const task: InitTask = {
      cancelled: false,
      connectRequested: false,
      connectStarted: false,
      promise: deferred.promise,
      resolve: deferred.resolve,
      reject: deferred.reject,
    };
    initTask = task;
    void task.promise.catch(() => undefined);
    queueMicrotask(() => {
      if (task.cancelled || !started || !enabled || blocked) {
        if (initTask === task) initTask = undefined;
        task.resolve(undefined);
        return;
      }
      void initialize(task).then(
        (value) => {
          if (initTask === task) initTask = undefined;
          task.resolve(value);
        },
        (error: Error) => {
          if (initTask === task) initTask = undefined;
          task.reject(error);
        },
      );
    });
    return task.promise;
  };

  const runDirectConnect = (
    targetBridge: AgentBridge,
    targetGeneration: number,
    link: string,
  ) => {
    const deferred = makeDeferred<void>();
    const attempt: ConnectAttempt = { reject: deferred.reject };
    connectAttempt = attempt;
    void Promise.resolve()
      .then(() => targetBridge.connect(link))
      .then(
        () => {
          if (
            connectAttempt !== attempt ||
            !isActive(targetBridge, targetGeneration)
          )
            return;
          connectAttempt = undefined;
          syncBridgeState(targetBridge, targetGeneration);
          deferred.resolve();
        },
        (error: unknown) => {
          if (
            connectAttempt !== attempt ||
            !isActive(targetBridge, targetGeneration)
          )
            return;
          connectAttempt = undefined;
          handleConnectFailure(targetBridge, targetGeneration);
          deferred.reject(
            error instanceof Error
              ? error
              : new Error("bridge connection failed"),
          );
        },
      );
    return deferred.promise;
  };

  const lifecycle: BridgeLifecycle = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => {
      if (started) return;
      started = true;
      if (enabled) void scheduleInitialization();
    },
    stop: () => {
      if (!started) return;
      started = false;
      dispose();
      queueMicrotask(() => {
        if (!started) pendingLink = undefined;
      });
    },
    setEnabled: (nextEnabled) => {
      if (enabled === nextEnabled) {
        if (nextEnabled && started) void scheduleInitialization();
        return;
      }
      enabled = nextEnabled;
      snapshot = { connection: snapshot.connection, enabled };
      notify();
      if (!enabled) {
        dispose();
        return;
      }
      if (started) void scheduleInitialization();
    },
    setFactory: (nextFactory) => {
      if (factory === nextFactory) return;
      factory = nextFactory;
      if (!started || !enabled) return;
      dispose();
      void scheduleInitialization();
    },
    setTools: async (tools) => {
      validateTools(tools);
      desiredTools = [...tools];
      desiredRevision += 1;
      if (snapshot.connection.status !== "connected" || !bridge) return;
      const targetBridge = bridge;
      return new Promise<void>((resolve, reject) => {
        syncWaiters.push({
          bridge: targetBridge,
          generation: bridgeGeneration,
          revision: desiredRevision,
          resolve,
          reject,
        });
        runCatalogSync();
      });
    },
    connect: async (pairingLink) => {
      const trimmed = pairingLink.trim();
      if (!trimmed) throw new Error("A pairing link is required.");

      if (enabled && started) {
        if (!bridge && initTask?.connectRequested)
          throw new Error("bridge connection is already in progress");
        if (bridge && (initTask?.connectStarted || connectAttempt))
          throw new Error("bridge connection is already in progress");
      }

      blocked = false;
      pendingLink = trimmed;
      if (!enabled || !started) return;

      if (!bridge) {
        const initialization = scheduleInitialization();
        if (initTask) initTask.connectRequested = true;
        await initialization;
        return;
      }
      pendingLink = undefined;
      return runDirectConnect(bridge, bridgeGeneration, trimmed);
    },
    disconnect: () => {
      blocked = true;
      pendingLink = undefined;
      dispose();
    },
  };

  return lifecycle;
}

function makeDeferred<T>() {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: resolvePromise,
    reject: (reason: unknown) => rejectPromise(reason),
  };
}

function normalizeLink(link: string | undefined) {
  const trimmed = link?.trim();
  return trimmed || undefined;
}

function validateTools(tools: readonly BridgeTool<unknown>[]) {
  validateCatalogTools(tools.map(({ handler: _handler, ...tool }) => tool));
}
