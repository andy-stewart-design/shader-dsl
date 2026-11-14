import {
  validateCatalogTools,
  validateInput,
  validateToolName,
} from "./schema.js";
import {
  BridgeResultError,
  normalizeResult,
  imageResult as makeImageResult,
} from "./results.js";
import {
  BRIDGE_CATALOG_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  LIMITS,
  isJsonValue,
  isRecord,
  jsonSize,
  wireByteLength,
  type BridgeConnectionState,
  type BridgeResult,
  type BridgeTool,
} from "./protocol.js";

export type { BridgeConnectionState, BridgeTool } from "./protocol.js";
export { makeImageResult as imageResult };

export type AgentBridge = {
  connect(pairingLink: string): Promise<void>;
  disconnect(): void;
  getState(): BridgeConnectionState;
  /** Atomically replace the page catalog after the helper acknowledges it. */
  updateTools(tools: readonly BridgeTool[]): Promise<void>;
};

type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
};

const OPEN = 1;
const RESUME_STORAGE_KEY = "agent-bridge:resume:v1";
const owners = new WeakMap<object, object>();

class BridgeClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BridgeClientError";
  }
}

type ResumeGrant = {
  version: 1;
  origin: string;
  pageUrl: string;
  endpoint: string;
  sessionId: string;
  resumeToken: string;
  pageId: string;
  resumeLeaseMs: number;
};

function browserWindow(): any | undefined {
  return typeof window === "undefined" ? undefined : window;
}

/** Consume the one-time pairing fragment without retaining its credentials. */
export function consumePairingLink(): string | undefined {
  const pageWindow = browserWindow();
  if (!pageWindow?.location) return undefined;
  const original = pageWindow.location.href;
  const url = new URL(original);
  const fragment = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );
  if (!fragment.has("bridgePort") || !fragment.has("bridgeToken"))
    return undefined;
  fragment.delete("bridgePort");
  fragment.delete("bridgeToken");
  url.hash = fragment.toString();
  try {
    pageWindow.history?.replaceState?.(null, "", url.href);
  } catch {
    // A restricted history object must not make pairing unusable.
  }
  return original;
}

export function connectAgentBridge(options: {
  tools: readonly BridgeTool[];
  onStateChange?: (state: BridgeConnectionState) => void;
}): AgentBridge {
  validateCatalogTools(
    options.tools.map(({ handler: _handler, ...tool }) => tool),
  );
  let currentTools = [...options.tools];
  const toolMap = new Map<string, BridgeTool>(
    currentTools.map((tool) => [tool.name, tool]),
  );

  const pageWindow = browserWindow();
  const ownerToken = {};
  let ownsWindow = true;
  if (pageWindow) {
    const previous = owners.get(pageWindow);
    if (previous) ownsWindow = false;
    else owners.set(pageWindow, ownerToken);
  }

  const pageId = randomId();
  const pageUrl = cleanPageUrl(pageWindow);
  const storage = usableSessionStorage(pageWindow);
  let state: BridgeConnectionState = ownsWindow
    ? { status: "disconnected" }
    : {
        status: "error",
        error: {
          code: "owner_conflict",
          message: "another bridge controller owns this page",
        },
      };
  let socket: SocketLike | undefined;
  let sessionId: string | undefined;
  let catalogVersion: number = BRIDGE_CATALOG_VERSION;
  let resumeCapable = false;
  let resumeGrant: ResumeGrant | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectDeadline = 0;
  let reconnectDelay: number = LIMITS.reconnectInitialDelayMs;
  let stopped = !ownsWindow;
  let pageLifecycleDropped = false;
  let pageSuspendedForBfcache = false;
  let autoResumeTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingCatalog:
    | {
        version: number;
        timer: ReturnType<typeof setTimeout>;
        tools: readonly BridgeTool[];
        resolve: () => void;
        reject: (error: Error) => void;
      }
    | undefined;

  type ActiveRequest = {
    controller: AbortController;
    timer: ReturnType<typeof setTimeout>;
    done: boolean;
    finish: (error?: BridgeClientError, result?: BridgeResult) => void;
  };
  const activeRequests = new Map<string, ActiveRequest>();

  const setState = (next: BridgeConnectionState) => {
    state = next;
    try {
      options.onStateChange?.(next);
    } catch {
      // State observers are application code and must not affect the bridge.
    }
  };
  const releaseOwner = () => {
    if (pageWindow && owners.get(pageWindow) === ownerToken) {
      owners.delete(pageWindow);
      ownsWindow = false;
    }
  };
  const removeLifecycleListeners = () => {
    try {
      pageWindow?.removeEventListener?.("pagehide", onPageLifecycle);
      pageWindow?.removeEventListener?.("pageshow", onPageShow);
      pageWindow?.removeEventListener?.("unload", onPageLifecycle);
    } catch {
      // Some test/browser window shims do not implement removal.
    }
  };
  const readGrant = (): ResumeGrant | undefined => {
    if (!storage) return undefined;
    let value: unknown;
    try {
      value = JSON.parse(storage.getItem(RESUME_STORAGE_KEY) ?? "null");
    } catch {
      return undefined;
    }
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      value.origin !== pageWindow?.location?.origin ||
      value.pageUrl !== pageUrl ||
      typeof value.endpoint !== "string" ||
      !/^ws:\/\/127\.0\.0\.1:\d+$/.test(value.endpoint) ||
      typeof value.sessionId !== "string" ||
      !value.sessionId ||
      typeof value.resumeToken !== "string" ||
      !value.resumeToken ||
      typeof value.pageId !== "string" ||
      !value.pageId ||
      typeof value.resumeLeaseMs !== "number" ||
      !Number.isSafeInteger(value.resumeLeaseMs) ||
      value.resumeLeaseMs <= 0 ||
      value.resumeLeaseMs > LIMITS.resumeLeaseMs
    )
      return undefined;
    const port = Number(
      value.endpoint.slice(value.endpoint.lastIndexOf(":") + 1),
    );
    if (port < 1 || port > 65535) return undefined;
    return value as unknown as ResumeGrant;
  };
  const clearGrant = (expected?: ResumeGrant) => {
    if (!storage) return;
    if (expected) {
      const current = readGrant();
      if (
        !current ||
        current.sessionId !== expected.sessionId ||
        current.resumeToken !== expected.resumeToken
      )
        return;
    }
    try {
      storage.removeItem(RESUME_STORAGE_KEY);
    } catch {
      // Storage can become unavailable while a document is being torn down.
    }
  };
  const saveGrant = (
    endpoint: string,
    newSessionId: string,
    token: string,
    lease: number,
  ): ResumeGrant | undefined => {
    if (!storage || !pageWindow?.location?.origin) return undefined;
    const grant: ResumeGrant = {
      version: 1,
      origin: pageWindow.location.origin,
      pageUrl,
      endpoint,
      sessionId: newSessionId,
      resumeToken: token,
      pageId,
      resumeLeaseMs: lease,
    };
    try {
      storage.setItem(RESUME_STORAGE_KEY, JSON.stringify(grant));
      return grant;
    } catch {
      return undefined;
    }
  };
  const rejectCatalog = (error: Error) => {
    if (!pendingCatalog) return;
    const request = pendingCatalog;
    pendingCatalog = undefined;
    clearTimeout(request.timer);
    request.reject(error);
  };
  const abortActive = (error?: BridgeClientError, send = false) => {
    for (const [requestId, request] of [...activeRequests]) {
      request.controller.abort();
      if (send && error && !request.done) request.finish(error);
      else {
        request.done = true;
        clearTimeout(request.timer);
        activeRequests.delete(requestId);
      }
    }
  };

  function onPageLifecycle(event?: { persisted?: boolean }) {
    // A persisted pagehide means the document is entering the BFCache. The
    // document and its controller still own the page, but its transport must
    // be dropped so the helper can hold the normal short resume lease.
    if (event?.persisted === true) {
      if (pageLifecycleDropped || pageSuspendedForBfcache) return;
      pageSuspendedForBfcache = true;
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      if (autoResumeTimer) clearTimeout(autoResumeTimer);
      autoResumeTimer = undefined;
      const current = socket;
      const hadOpenTransport = current?.readyState === OPEN;
      socket = undefined;
      sessionId = undefined;
      catalogVersion = BRIDGE_CATALOG_VERSION;
      abortActive(undefined, false);
      rejectCatalog(new BridgeClientError("not_connected", "page suspended"));
      if (current && current.readyState < 2) {
        try {
          current.close();
        } catch {
          // best effort while entering the BFCache
        }
      }
      if (resumeGrant) {
        // A connected socket's close starts the helper's lease. Never extend
        // an already-running lease when transport loss preceded pagehide.
        if (hadOpenTransport)
          reconnectDeadline = Date.now() + resumeGrant.resumeLeaseMs;
        resumeCapable = true;
      } else {
        resumeCapable = false;
      }
      setState({ status: "disconnected" });
      return;
    }
    if (pageLifecycleDropped) return;
    pageLifecycleDropped = true;
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    if (autoResumeTimer) clearTimeout(autoResumeTimer);
    autoResumeTimer = undefined;
    const current = socket;
    socket = undefined;
    sessionId = undefined;
    resumeCapable = false;
    abortActive(undefined, false);
    rejectCatalog(new BridgeClientError("not_connected", "page unloaded"));
    if (current && current.readyState < 2) {
      try {
        current.close();
      } catch {
        // best effort during page teardown
      }
    }
    releaseOwner();
  }

  function onPageShow(event?: { persisted?: boolean }) {
    if (
      event?.persisted !== true ||
      pageLifecycleDropped ||
      !pageSuspendedForBfcache ||
      !ownsWindow
    )
      return;
    pageSuspendedForBfcache = false;
    stopped = false;
    const stored = readGrant();
    if (!stored || !resumeGrant) {
      failTerminal(
        new BridgeClientError(
          "resume_expired",
          "bridge resume credential is unavailable",
        ),
        resumeGrant,
      );
      return;
    }
    resumeGrant = stored;
    resumeCapable = true;
    if (Date.now() >= reconnectDeadline) {
      failTerminal(
        new BridgeClientError("resume_expired", "bridge resume lease expired"),
        resumeGrant,
      );
      return;
    }
    reconnectDelay = LIMITS.reconnectInitialDelayMs;
    setState({ status: "connecting" });
    autoResumeTimer = setTimeout(() => {
      autoResumeTimer = undefined;
      if (stopped || pageLifecycleDropped || !resumeGrant || socket) return;
      void startSocket(
        { endpoint: resumeGrant.endpoint, resume: resumeGrant },
        "auto",
      ).catch(() => undefined);
    }, 0);
  }

  if (pageWindow?.addEventListener && ownsWindow) {
    pageWindow.addEventListener("pagehide", onPageLifecycle);
    pageWindow.addEventListener("pageshow", onPageShow);
    pageWindow.addEventListener("unload", onPageLifecycle);
  }

  const failTerminal = (error: Error, expectedGrant?: ResumeGrant) => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    clearGrant(expectedGrant);
    abortActive(undefined, false);
    rejectCatalog(error);
    releaseOwner();
    removeLifecycleListeners();
    setState({
      status: "error",
      error: { code: errorCode(error), message: error.message },
    });
  };

  const closeTransport = (
    error?: Error,
    allowResume = true,
    expected?: SocketLike,
  ) => {
    if (expected && socket !== expected) return;
    const current = socket;
    socket = undefined;
    sessionId = undefined;
    catalogVersion = BRIDGE_CATALOG_VERSION;
    abortActive(undefined, false);
    rejectCatalog(
      error ?? new BridgeClientError("not_connected", "bridge disconnected"),
    );
    if (current && current.readyState < 2) {
      try {
        current.close();
      } catch {
        // closing a failed socket is best effort
      }
    }
    if (
      allowResume &&
      resumeCapable &&
      resumeGrant &&
      !stopped &&
      !pageLifecycleDropped
    ) {
      reconnectDeadline = Date.now() + resumeGrant.resumeLeaseMs;
      reconnectDelay = LIMITS.reconnectInitialDelayMs;
      setState({ status: "connecting" });
      scheduleResume();
    } else if (state.status !== "disconnected") {
      setState({ status: "disconnected" });
    }
  };

  function scheduleResume() {
    if (
      reconnectTimer ||
      stopped ||
      pageLifecycleDropped ||
      !resumeGrant ||
      Date.now() >= reconnectDeadline
    ) {
      if (resumeGrant && Date.now() >= reconnectDeadline)
        failTerminal(
          new BridgeClientError(
            "resume_expired",
            "bridge resume lease expired",
          ),
          resumeGrant,
        );
      return;
    }
    const delay = Math.min(
      reconnectDelay,
      Math.max(0, reconnectDeadline - Date.now()),
    );
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      const grant = readGrant();
      if (!grant) {
        failTerminal(
          new BridgeClientError(
            "resume_expired",
            "bridge resume credential is unavailable",
          ),
          resumeGrant,
        );
        return;
      }
      resumeGrant = grant;
      reconnectDelay = Math.min(reconnectDelay * 2, LIMITS.reconnectMaxDelayMs);
      void startSocket(
        { endpoint: grant.endpoint, resume: grant },
        "auto",
      ).catch(() => undefined);
    }, delay);
  }

  function failAttempt(
    candidate: SocketLike,
    error: Error,
    intent: "manual" | "auto",
    terminal: boolean,
    reject?: (error: Error) => void,
  ) {
    if (socket && socket !== candidate) {
      reject?.(error);
      return;
    }
    if (socket === candidate) socket = undefined;
    sessionId = undefined;
    abortActive(undefined, false);
    rejectCatalog(error);
    try {
      if (candidate.readyState < 2) candidate.close();
    } catch {
      // ignore close errors
    }
    if (reject) reject(error);
    if (terminal) {
      failTerminal(error, intent === "auto" ? resumeGrant : undefined);
      return;
    }
    if (intent === "auto" && resumeGrant && !stopped) {
      resumeCapable = true;
      setState({ status: "connecting" });
      scheduleResume();
    } else {
      failTerminal(error);
    }
  }

  function startSocket(
    connection: {
      endpoint: string;
      token?: string;
      resume?: ResumeGrant;
    },
    intent: "manual" | "auto",
  ): Promise<void> {
    if (stopped || !ownsWindow)
      return Promise.reject(
        new BridgeClientError(
          "owner_conflict",
          "bridge controller is not active",
        ),
      );
    const WebSocketCtor = (globalThis as any).WebSocket;
    if (typeof WebSocketCtor !== "function") {
      const error = new BridgeClientError(
        "not_connected",
        "WebSocket is unavailable",
      );
      if (intent === "auto") failTerminal(error, resumeGrant);
      return Promise.reject(error);
    }
    let candidate: SocketLike;
    try {
      candidate = new WebSocketCtor(connection.endpoint) as SocketLike;
    } catch (error) {
      const reason =
        error instanceof Error ? error : new Error("bridge connection failed");
      if (intent === "auto")
        failAttempt({} as SocketLike, reason, intent, false);
      return Promise.reject(reason);
    }
    socket = candidate;
    setState({ status: "connecting" });

    let settled = false;
    let authRejected = false;
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    let resolveConnection!: () => void;
    let rejectConnection!: (error: Error) => void;
    const result = new Promise<void>((resolve, reject) => {
      resolveConnection = resolve;
      rejectConnection = reject;
    });
    const finish = (error?: Error) => {
      if (settled) {
        if (error && socket === candidate) {
          closeTransport(error, false, candidate);
          failTerminal(error, resumeGrant);
        }
        return;
      }
      settled = true;
      clearTimeout(authTimer);
      if (error) {
        const terminal =
          intent === "auto" &&
          (authRejected ||
            errorCode(error) === "auth_error" ||
            errorCode(error) === "resume_rejected" ||
            errorCode(error) === "resume_expired" ||
            errorCode(error) === "owner_conflict");
        failAttempt(candidate, error, intent, terminal, rejectConnection);
      } else resolveConnection();
    };

    try {
      authTimer = setTimeout(
        () =>
          finish(new BridgeClientError("timeout", "authentication timed out")),
        LIMITS.authenticationTimeoutMs,
      );
      candidate.addEventListener("open", () => {
        if (socket !== candidate) return;
        try {
          const auth = connection.resume
            ? {
                type: "resume",
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                sessionId: connection.resume.sessionId,
                resumeToken: connection.resume.resumeToken,
                pageId,
                pageUrl,
              }
            : storage
              ? {
                  type: "auth",
                  token: connection.token,
                  resumable: true,
                  pageId,
                  pageUrl,
                }
              : { type: "auth", token: connection.token };
          candidate.send(JSON.stringify(auth));
        } catch {
          finish(
            new BridgeClientError(
              "not_connected",
              "authentication send failed",
            ),
          );
        }
      });
      candidate.addEventListener("message", (event: { data: unknown }) => {
        if (socket !== candidate) return;
        let message: any;
        try {
          if (wireByteLength(event.data) > LIMITS.authenticatedFrameBytes)
            throw new BridgeClientError(
              "payload_limit",
              "message exceeds payload limit",
            );
          message = parseEventData(event.data);
        } catch (error) {
          finish(
            error instanceof BridgeClientError
              ? error
              : new BridgeClientError(
                  "invalid_message",
                  "malformed bridge message",
                ),
          );
          return;
        }
        if (!isRecord(message) || typeof message.type !== "string") {
          finish(
            new BridgeClientError(
              "invalid_message",
              "malformed bridge message",
            ),
          );
          return;
        }
        if (message.type === "auth_error") {
          const code = isWireError(message.error)
            ? message.error.code
            : "auth_error";
          // A refresh can reach the helper just before its previous socket closes.
          authRejected = code !== "session_conflict";
          const text = isWireError(message.error)
            ? message.error.message
            : "bridge authentication failed";
          finish(new BridgeClientError(code, text));
          return;
        }
        if (message.type === "auth_ok") {
          if (sessionId !== undefined || state.status !== "connecting") {
            finish(
              new BridgeClientError(
                "invalid_message",
                "unexpected authentication acknowledgement",
              ),
            );
            return;
          }
          if (
            message.protocolVersion !== BRIDGE_PROTOCOL_VERSION ||
            typeof message.sessionId !== "string" ||
            !message.sessionId ||
            (message.pageId !== undefined && message.pageId !== pageId)
          ) {
            finish(
              new BridgeClientError(
                "unsupported_protocol",
                "unsupported bridge protocol",
              ),
            );
            return;
          }
          if (
            connection.resume &&
            message.sessionId === connection.resume.sessionId
          ) {
            finish(
              new BridgeClientError(
                "resume_rejected",
                "bridge did not issue a fresh session",
              ),
            );
            return;
          }
          sessionId = message.sessionId;
          catalogVersion = BRIDGE_CATALOG_VERSION;
          const token =
            typeof message.resumeToken === "string" &&
            message.resumeToken.length > 0
              ? message.resumeToken
              : undefined;
          const lease =
            typeof message.resumeLeaseMs === "number" &&
            Number.isSafeInteger(message.resumeLeaseMs) &&
            message.resumeLeaseMs > 0 &&
            message.resumeLeaseMs <= LIMITS.resumeLeaseMs
              ? message.resumeLeaseMs
              : LIMITS.resumeLeaseMs;
          if (token && storage) {
            resumeGrant = saveGrant(
              connection.endpoint,
              sessionId,
              token,
              lease,
            );
            resumeCapable = !!resumeGrant;
          } else {
            if (connection.resume) clearGrant(connection.resume);
            resumeGrant = undefined;
            resumeCapable = false;
          }
          const catalog = makeCatalog(
            currentTools,
            sessionId,
            BRIDGE_CATALOG_VERSION,
          );
          if (jsonSize(catalog) > LIMITS.catalogBytes) {
            finish(
              new BridgeClientError(
                "payload_limit",
                "tool catalog exceeds the limit",
              ),
            );
            return;
          }
          try {
            candidate.send(JSON.stringify(catalog));
          } catch {
            finish(
              new BridgeClientError("not_connected", "catalog send failed"),
            );
          }
          return;
        }
        if (message.type === "catalog_ok") {
          if (
            message.protocolVersion !== BRIDGE_PROTOCOL_VERSION ||
            message.sessionId !== sessionId ||
            !Number.isSafeInteger(message.catalogVersion)
          ) {
            finish(
              new BridgeClientError(
                "invalid_message",
                "malformed catalog acknowledgement",
              ),
            );
            return;
          }
          if (!pendingCatalog) {
            if (
              state.status !== "connecting" ||
              message.catalogVersion !== BRIDGE_CATALOG_VERSION
            ) {
              finish(
                new BridgeClientError(
                  "stale_catalog",
                  "unexpected catalog version",
                ),
              );
              return;
            }
            catalogVersion = message.catalogVersion;
            setState({
              status: "connected",
              sessionId: sessionId!,
              catalogVersion,
            });
            finish();
            return;
          }
          if (message.catalogVersion !== pendingCatalog.version) {
            const request = pendingCatalog;
            pendingCatalog = undefined;
            clearTimeout(request.timer);
            request.reject(
              new BridgeClientError(
                "stale_catalog",
                "catalog acknowledgement is stale",
              ),
            );
            return;
          }
          const request = pendingCatalog;
          pendingCatalog = undefined;
          clearTimeout(request.timer);
          abortActive(
            new BridgeClientError(
              "stale_catalog",
              "catalog changed; tool outcome is uncertain",
            ),
            true,
          );
          currentTools = [...request.tools];
          toolMap.clear();
          for (const tool of request.tools) toolMap.set(tool.name, tool);
          catalogVersion = request.version;
          setState({
            status: "connected",
            sessionId: sessionId!,
            catalogVersion,
          });
          request.resolve();
          return;
        }
        if (message.type === "catalog_error") {
          if (
            message.protocolVersion !== BRIDGE_PROTOCOL_VERSION ||
            message.sessionId !== sessionId ||
            !isWireError(message.error)
          ) {
            finish(
              new BridgeClientError(
                "invalid_message",
                "malformed catalog error",
              ),
            );
            return;
          }
          if (
            pendingCatalog &&
            message.catalogVersion === pendingCatalog.version
          ) {
            const request = pendingCatalog;
            pendingCatalog = undefined;
            clearTimeout(request.timer);
            request.reject(
              new BridgeClientError(
                message.error.code,
                "catalog update rejected",
              ),
            );
          }
          return;
        }
        if (message.type === "cancel") {
          if (
            message.sessionId === sessionId &&
            typeof message.requestId === "string"
          ) {
            const request = activeRequests.get(message.requestId);
            if (request && !request.done) {
              request.controller.abort();
              request.finish(
                new BridgeClientError(
                  "cancelled",
                  "tool cancellation outcome is uncertain",
                ),
              );
            }
          }
          return;
        }
        if (message.type === "request") {
          void handleRequest(candidate, message, toolMap);
          return;
        }
        if (
          message.type === "response" &&
          typeof message.requestId === "string"
        )
          return;
        finish(
          new BridgeClientError("invalid_message", "unexpected bridge message"),
        );
      });
      candidate.addEventListener("error", () => {
        if (!settled)
          finish(
            new BridgeClientError("not_connected", "bridge WebSocket error"),
          );
        else
          closeTransport(
            new BridgeClientError("not_connected", "bridge WebSocket error"),
            true,
            candidate,
          );
      });
      candidate.addEventListener("close", () => {
        if (!settled) {
          finish(
            new BridgeClientError("not_connected", "bridge WebSocket closed"),
          );
          return;
        }
        closeTransport(undefined, true, candidate);
      });
    } catch (error) {
      finish(
        error instanceof Error ? error : new Error("bridge connection failed"),
      );
    }
    return result;
  }

  async function connect(pairingLink: string): Promise<void> {
    if (pageWindow) {
      const existing = owners.get(pageWindow);
      if (existing && existing !== ownerToken)
        throw new BridgeClientError(
          "owner_conflict",
          "another bridge controller owns this page",
        );
      if (!ownsWindow) {
        owners.set(pageWindow, ownerToken);
        ownsWindow = true;
        pageWindow.addEventListener?.("pagehide", onPageLifecycle);
        pageWindow.addEventListener?.("pageshow", onPageShow);
        pageWindow.addEventListener?.("unload", onPageLifecycle);
      }
    }
    stopped = false;
    pageLifecycleDropped = false;
    if (autoResumeTimer) {
      clearTimeout(autoResumeTimer);
      autoResumeTimer = undefined;
    }
    if (state.status === "connected" || state.status === "connecting")
      throw new Error("bridge is already connected");
    let parsed: { websocketUrl: string; token: string };
    try {
      parsed = parsePairingLink(pairingLink);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "invalid pairing link";
      setState({
        status: "error",
        error: { code: "invalid_message", message: reason },
      });
      throw error;
    }
    stopped = false;
    pageLifecycleDropped = false;
    resumeGrant = undefined;
    resumeCapable = false;
    return startSocket(
      { endpoint: parsed.websocketUrl, token: parsed.token },
      "manual",
    ) as Promise<void>;
  }

  async function updateTools(tools: readonly BridgeTool[]): Promise<void> {
    const publicTools = tools.map(({ handler: _handler, ...tool }) => tool);
    validateCatalogTools(publicTools);
    const nextVersion = catalogVersion + 1;
    if (!socket || !sessionId || state.status !== "connected")
      throw new BridgeClientError("not_connected", "no authenticated bridge");
    if (pendingCatalog)
      throw new BridgeClientError(
        "invalid_message",
        "a catalog update is already pending",
      );
    const catalog = makeCatalog(tools, sessionId, nextVersion);
    if (jsonSize(catalog) > LIMITS.catalogBytes)
      throw new BridgeClientError(
        "payload_limit",
        "tool catalog exceeds the limit",
      );
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pendingCatalog?.version !== nextVersion) return;
        const error = new BridgeClientError(
          "timeout",
          "catalog update timed out; reconnect to rediscover tools",
        );
        rejectCatalog(error);
        closeTransport(error, true);
      }, LIMITS.requestTimeoutMs);
      pendingCatalog = {
        version: nextVersion,
        timer,
        tools: [...tools],
        resolve,
        reject,
      };
      try {
        socket!.send(JSON.stringify(catalog));
      } catch {
        const request = pendingCatalog;
        pendingCatalog = undefined;
        clearTimeout(request.timer);
        request.reject(
          new BridgeClientError("not_connected", "catalog send failed"),
        );
      }
    });
  }

  async function handleRequest(
    next: SocketLike,
    message: any,
    registered: Map<string, BridgeTool>,
  ) {
    const requestId =
      isRecord(message) && typeof message.requestId === "string"
        ? message.requestId
        : undefined;
    const requestSession =
      isRecord(message) && typeof message.sessionId === "string"
        ? message.sessionId
        : undefined;
    const requestCatalog =
      isRecord(message) && Number.isSafeInteger(message.catalogVersion)
        ? message.catalogVersion
        : undefined;
    const respond = (payload: Record<string, unknown>) => {
      if (!requestId || socket !== next || next.readyState !== OPEN) return;
      const withMetadata: Record<string, unknown> = { ...payload };
      if (requestSession !== undefined) withMetadata.sessionId = requestSession;
      if (requestCatalog !== undefined)
        withMetadata.catalogVersion = requestCatalog;
      let bounded = withMetadata;
      try {
        if (jsonSize(withMetadata) > LIMITS.authenticatedFrameBytes) {
          bounded = {
            type: "response",
            requestId,
            sessionId: requestSession,
            catalogVersion: requestCatalog,
            ok: false,
            error: {
              code: "payload_limit",
              message: "result exceeds payload limit",
            },
          };
        }
        next.send(JSON.stringify(bounded));
      } catch {
        // Never let an application result escape into the page event loop.
      }
    };
    if (
      !isRecord(message) ||
      message.type !== "request" ||
      !requestId ||
      typeof message.sessionId !== "string" ||
      !Number.isSafeInteger(message.catalogVersion) ||
      typeof message.toolName !== "string" ||
      !isJsonValue(message.input)
    ) {
      respond({
        type: "response",
        requestId: requestId ?? "invalid",
        ok: false,
        error: { code: "invalid_message", message: "malformed tool request" },
      });
      return;
    }
    if (message.sessionId !== sessionId) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: { code: "stale_session", message: "stale session" },
      });
      return;
    }
    if (message.catalogVersion !== catalogVersion) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: { code: "stale_catalog", message: "stale catalog" },
      });
      return;
    }
    if (jsonSize(message) > LIMITS.authenticatedFrameBytes) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: {
          code: "payload_limit",
          message: "request exceeds payload limit",
        },
      });
      return;
    }
    const tool = registered.get(message.toolName);
    if (!tool) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: { code: "unknown_tool", message: "unknown tool" },
      });
      return;
    }
    const validation = validateInput(tool.inputSchema, message.input);
    if (!validation.ok) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: { code: "invalid_arguments", message: validation.message },
      });
      return;
    }
    if (activeRequests.has(requestId)) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: {
          code: "invalid_message",
          message: "duplicate request identifier",
        },
      });
      return;
    }
    if (activeRequests.size >= LIMITS.pendingCalls) {
      respond({
        type: "response",
        requestId,
        ok: false,
        error: {
          code: "payload_limit",
          message: "too many tool requests are pending",
        },
      });
      return;
    }
    const controller = new AbortController();
    let entry!: ActiveRequest;
    const finish = (error?: BridgeClientError, result?: BridgeResult) => {
      if (entry.done) return;
      entry.done = true;
      clearTimeout(entry.timer);
      if (activeRequests.get(requestId) === entry)
        activeRequests.delete(requestId);
      if (error)
        respond({
          type: "response",
          requestId,
          ok: false,
          error: { code: error.code, message: error.message },
        });
      else respond({ type: "response", requestId, ok: true, result });
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(
        new BridgeClientError(
          "timeout",
          "tool timed out; outcome may be uncertain",
        ),
      );
    }, LIMITS.requestTimeoutMs);
    entry = { controller, timer, done: false, finish };
    activeRequests.set(requestId, entry);
    try {
      let value: unknown;
      try {
        value = await tool.handler(message.input, {
          signal: controller.signal,
        });
      } catch {
        if (!entry.done) {
          finish(
            new BridgeClientError(
              controller.signal.aborted ? "timeout" : "handler_error",
              controller.signal.aborted
                ? "tool timed out; outcome may be uncertain"
                : "tool handler failed",
            ),
          );
        }
        return;
      }
      if (entry.done) return;
      try {
        finish(undefined, normalizeResult(value));
      } catch (error) {
        const code =
          error instanceof BridgeResultError ? error.code : "invalid_message";
        finish(
          new BridgeClientError(
            code,
            code === "payload_limit"
              ? "tool result exceeds the payload limit"
              : "tool returned an invalid result",
          ),
        );
      }
    } finally {
      if (activeRequests.get(requestId) === entry)
        activeRequests.delete(requestId);
    }
  }

  const disconnect = () => {
    if (
      pageWindow &&
      owners.get(pageWindow) &&
      owners.get(pageWindow) !== ownerToken
    )
      return;
    stopped = true;
    pageLifecycleDropped = true;
    pageSuspendedForBfcache = false;
    if (autoResumeTimer) clearTimeout(autoResumeTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    autoResumeTimer = undefined;
    reconnectTimer = undefined;
    if (resumeGrant) clearGrant(resumeGrant);
    else if (ownsWindow) clearGrant();
    abortActive(undefined, false);
    rejectCatalog(
      new BridgeClientError("not_connected", "bridge disconnected"),
    );
    const current = socket;
    const oldSession = sessionId;
    socket = undefined;
    sessionId = undefined;
    resumeCapable = false;
    if (current && current.readyState === OPEN && oldSession) {
      try {
        current.send(
          JSON.stringify({ type: "disconnect", sessionId: oldSession }),
        );
      } catch {
        // local revocation still happens when the transport is unavailable
      }
    }
    if (current && current.readyState < 2) {
      try {
        current.close();
      } catch {
        // best effort
      }
    }
    removeLifecycleListeners();
    releaseOwner();
    setState({ status: "disconnected" });
  };

  // A same-URL reload or same-origin history traversal creates a new
  // controller/document but keeps sessionStorage. Both are eligible to use
  // the still-live bridge lease; ordinary navigation is intentionally not.
  // Delaying one turn lets an explicit pairing-link connect win the race.
  // BFCache resumes are handled by pageshow above.
  const stored = readGrant();
  const navigationType = (() => {
    try {
      return pageWindow?.performance?.getEntriesByType?.("navigation")?.[0]
        ?.type;
    } catch {
      return undefined;
    }
  })();
  const canResumeNewDocument =
    navigationType === "reload" || navigationType === "back_forward";
  if (ownsWindow && stored && canResumeNewDocument) {
    resumeGrant = stored;
    resumeCapable = true;
    autoResumeTimer = setTimeout(() => {
      autoResumeTimer = undefined;
      if (stopped || socket || !resumeGrant) return;
      reconnectDeadline = Date.now() + resumeGrant.resumeLeaseMs;
      reconnectDelay = LIMITS.reconnectInitialDelayMs;
      void startSocket(
        { endpoint: resumeGrant.endpoint, resume: resumeGrant },
        "auto",
      ).catch(() => undefined);
    }, 0);
  } else if (ownsWindow) {
    clearGrant();
  }

  return { connect, disconnect, getState: () => state, updateTools };
}

function makeCatalog(
  tools: readonly BridgeTool[],
  sessionId: string,
  catalogVersion: number,
) {
  return {
    type: "catalog" as const,
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    catalogVersion,
    sessionId,
    tools: tools.map(({ handler: _handler, ...publicTool }) => publicTool),
  };
}

function isWireError(
  value: unknown,
): value is { code: string; message: string } {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    value.code.length <= 64 &&
    value.message.length <= 512
  );
}

function errorCode(error: Error): string {
  return error instanceof BridgeClientError ? error.code : "not_connected";
}

function parseEventData(data: unknown): unknown {
  if (typeof data === "string") return JSON.parse(data);
  if (data instanceof ArrayBuffer)
    return JSON.parse(new TextDecoder().decode(data));
  if (ArrayBuffer.isView(data))
    return JSON.parse(new TextDecoder().decode(data));
  return JSON.parse(String(data));
}

function randomId(): string {
  try {
    const cryptoObject = (globalThis as any).crypto;
    if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
    if (cryptoObject?.getRandomValues) {
      const bytes = new Uint8Array(16);
      cryptoObject.getRandomValues(bytes);
      return Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    }
  } catch {
    // Fall through to a non-secret per-document identifier.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function cleanPageUrl(pageWindow: any): string {
  try {
    const url = new URL(
      pageWindow?.location?.href ??
        `${pageWindow?.location?.origin ?? "http://localhost"}/`,
    );
    const fragment = new URLSearchParams(
      url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
    );
    fragment.delete("bridgePort");
    fragment.delete("bridgeToken");
    url.hash = fragment.toString();
    return url.href;
  } catch {
    return "";
  }
}

function usableSessionStorage(pageWindow: any): Storage | undefined {
  if (!pageWindow) return undefined;
  try {
    const candidate = pageWindow.sessionStorage as Storage;
    if (!candidate || typeof candidate.getItem !== "function") return undefined;
    const probe = `${RESUME_STORAGE_KEY}:probe`;
    candidate.setItem(probe, "1");
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return undefined;
  }
}

function parsePairingLink(link: string): {
  websocketUrl: string;
  token: string;
} {
  const pageWindow = browserWindow();
  if (!pageWindow) throw new Error("pairing is only available in a browser");
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("invalid pairing link");
  }
  const localDevelopment =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    url.origin !== pageWindow.location.origin ||
    (!localDevelopment && url.protocol !== "https:") ||
    url.username ||
    url.password
  )
    throw new Error(
      "pairing link origin does not match this HTTPS or localhost page",
    );
  const params = url.hash
    ? new URLSearchParams(url.hash.slice(1))
    : new URLSearchParams();
  const port = params.get("bridgePort");
  const token = params.get("bridgeToken");
  if (
    !port ||
    !token ||
    !/^\d+$/.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65535
  )
    throw new Error("pairing link is missing bridge credentials");
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token))
    throw new Error("invalid pairing credential");
  return { websocketUrl: `ws://127.0.0.1:${Number(port)}`, token };
}
