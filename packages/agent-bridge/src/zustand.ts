import { createStore } from "zustand/vanilla";
import {
  connectAgentBridge,
  consumePairingLink,
  type AgentBridge,
  type BridgeConnectionState,
  type BridgeTool,
} from "./browser.js";
import { validateCatalogTools } from "./schema.js";

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

// Capture and scrub credentials before an application has a chance to render.
// The value is deliberately consumed by only the first store created by this
// module, rather than being shared as store state.
let modulePairingLink = consumePairingLink();

type InitTask = {
  cancelled: boolean;
  connectStarted: boolean;
  promise: Promise<AgentBridge | undefined>;
  resolve: (bridge: AgentBridge | undefined) => void;
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

type ConnectAttempt = {
  reject: (error: Error) => void;
};

export function createAgentBridgeStore(options: AgentBridgeStoreOptions = {}) {
  const initialTools = options.tools ?? [];
  validateTools(initialTools);

  let desiredTools = [...initialTools];
  let activeTools = [...initialTools];
  let desiredRevision = 0;
  let activeRevision = 0;
  let bridge: AgentBridge | undefined;
  let bridgeGeneration = 0;
  let generation = 0;
  let blocked = false;
  let pendingLink = normalizeLink(
    options.initialPairingLink ?? modulePairingLink,
  );
  modulePairingLink = undefined;
  let initTask: InitTask | undefined;
  let connectAttempt: ConnectAttempt | undefined;
  let syncInFlight: CatalogSync | undefined;
  const syncWaiters: SyncWaiter[] = [];

  const store = createStore<AgentBridgeStore>((set, get) => {
    const isActive = (targetBridge: AgentBridge, targetGeneration: number) =>
      bridge === targetBridge && bridgeGeneration === targetGeneration;

    const publishError = (code: string, message: string) => {
      set({ connection: { status: "error", error: { code, message } } });
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
      for (let index = syncWaiters.length - 1; index >= 0; index--) {
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

    const runCatalogSync = () => {
      if (syncInFlight || !bridge || get().connection.status !== "connected")
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
      set({ connection: next });
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

    const dispose = () => {
      generation += 1;
      const attempt = connectAttempt;
      connectAttempt = undefined;
      attempt?.reject(new Error("bridge connection cancelled"));
      const current = bridge;
      bridge = undefined;
      bridgeGeneration = 0;
      syncInFlight = undefined;
      rejectSyncWaiters(new Error("bridge disconnected"));
      if (current) {
        try {
          current.disconnect();
        } catch {
          // A factory is application code; disposal remains terminal.
        }
      }
      set({ connection: { status: "disconnected" } });
    };

    const cancelInitialization = () => {
      const task = initTask;
      if (!task) return;
      task.cancelled = true;
      initTask = undefined;
      task.reject(new Error("bridge initialization cancelled"));
    };

    const initialize = async (
      task: InitTask,
    ): Promise<AgentBridge | undefined> => {
      if (task.cancelled || !get().enabled || blocked) return undefined;
      const controllerGeneration = ++generation;
      let created: AgentBridge | undefined;
      try {
        created = (options.bridgeFactory ?? connectAgentBridge)({
          tools: desiredTools,
          onStateChange: (next) => {
            if (
              !created ||
              bridge !== created ||
              bridgeGeneration !== controllerGeneration
            )
              return;
            set({ connection: next });
            if (next.status === "connected") runCatalogSync();
          },
        });
      } catch {
        if (initTask === task && !task.cancelled)
          publishError("initialization_failed", "bridge initialization failed");
        throw new Error("bridge initialization failed");
      }
      if (!created) {
        if (initTask === task && !task.cancelled)
          publishError("initialization_failed", "bridge initialization failed");
        throw new Error("bridge initialization failed");
      }
      if (task.cancelled || !get().enabled || blocked) {
        try {
          created.disconnect();
        } catch {
          // Best effort for a factory created during cancellation.
        }
        return undefined;
      }

      bridge = created;
      bridgeGeneration = controllerGeneration;
      activeTools = [...desiredTools];
      activeRevision = desiredRevision;
      set({ connection: created.getState() });

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
      if (!get().enabled || blocked || bridge) return Promise.resolve(bridge);

      const taskDeferred = makeDeferred<AgentBridge | undefined>();
      const task: InitTask = {
        cancelled: false,
        connectStarted: false,
        promise: taskDeferred.promise,
        resolve: taskDeferred.resolve,
        reject: taskDeferred.reject,
      };
      initTask = task;
      // An eager enable has no caller waiting on this promise. Attaching a
      // handler here also keeps a failed initial pairing out of unhandled errors.
      void task.promise.catch(() => undefined);
      queueMicrotask(() => {
        if (task.cancelled || !get().enabled || blocked) {
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

    const connect = async (pairingLink: string): Promise<void> => {
      const trimmed = pairingLink.trim();
      if (!trimmed) throw new Error("A pairing link is required.");
      blocked = false;
      pendingLink = trimmed;
      if (!get().enabled) return;

      if (!bridge) {
        await scheduleInitialization();
        return;
      }

      if (initTask?.connectStarted || connectAttempt) {
        pendingLink = undefined;
        throw new Error("bridge connection is already in progress");
      }
      pendingLink = undefined;
      return runDirectConnect(bridge, bridgeGeneration, trimmed);
    };

    const disconnect = () => {
      blocked = true;
      pendingLink = undefined;
      cancelInitialization();
      dispose();
    };

    const setEnabled = (enabled: boolean) => {
      set({ enabled });
      if (!enabled) {
        cancelInitialization();
        dispose();
        return;
      }
      scheduleInitialization();
    };

    const setTools = async (
      tools: readonly BridgeTool<unknown>[],
    ): Promise<void> => {
      validateTools(tools);
      desiredTools = [...tools];
      desiredRevision += 1;
      if (get().connection.status !== "connected") return;
      const targetBridge = bridge;
      if (!targetBridge) return;
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
    };

    return {
      connection: { status: "disconnected" },
      enabled: options.enabled === true,
      connect,
      disconnect,
      setEnabled,
      setTools,
    };
  });

  if (options.enabled === true) {
    store.getState().setEnabled(true);
  }
  return store;
}

function makeDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function normalizeLink(link: string | undefined) {
  const trimmed = link?.trim();
  return trimmed || undefined;
}

function validateTools(tools: readonly BridgeTool<unknown>[]) {
  validateCatalogTools(tools.map(({ handler: _handler, ...tool }) => tool));
}
