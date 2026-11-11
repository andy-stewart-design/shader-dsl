import { LIMITS } from "./protocol.js";

export type SessionClock = {
  now(): number;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
};

const realClock: SessionClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type SuspendedSession<TCredential = unknown> = {
  sessionId: string;
  pageId: string;
  pageUrl: string;
  credential: TCredential;
  expiresAt: number;
};

/**
 * The short-lived authority retained while a resumable page's transport is
 * interrupted. It deliberately stores no application state or pending work.
 */
export class SessionLease<TCredential = unknown> {
  private suspended: SuspendedSession<TCredential> | undefined;
  private expiryTimer: unknown;
  private readonly clock: SessionClock;
  private readonly leaseMs: number;
  private readonly onExpire?: () => void;

  constructor(
    options: {
      leaseMs?: number;
      clock?: SessionClock;
      onExpire?: () => void;
    } = {},
  ) {
    this.leaseMs = options.leaseMs ?? LIMITS.resumeLeaseMs;
    this.clock = options.clock ?? realClock;
    this.onExpire = options.onExpire;
  }

  get current(): SuspendedSession<TCredential> | undefined {
    const value = this.suspended;
    if (value && this.clock.now() >= value.expiresAt) {
      this.expire();
      return undefined;
    }
    return value;
  }

  suspend(input: {
    sessionId: string;
    pageId: string;
    pageUrl: string;
    credential: TCredential;
  }): SuspendedSession<TCredential> {
    this.clearTimer();
    const value: SuspendedSession<TCredential> = {
      ...input,
      expiresAt: this.clock.now() + this.leaseMs,
    };
    this.suspended = value;
    this.expiryTimer = this.clock.setTimeout(() => this.expire(), this.leaseMs);
    return value;
  }

  /** Consume only after the caller has checked the credential and binding. */
  take(): SuspendedSession<TCredential> | undefined {
    const value = this.current;
    if (!value) return undefined;
    this.suspended = undefined;
    this.clearTimer();
    return value;
  }

  revoke(): void {
    this.suspended = undefined;
    this.clearTimer();
  }

  hasLease(): boolean {
    return this.current !== undefined;
  }

  private expire(): void {
    if (!this.suspended) return;
    this.suspended = undefined;
    this.clearTimer();
    this.onExpire?.();
  }

  private clearTimer(): void {
    if (this.expiryTimer !== undefined) {
      this.clock.clearTimeout(this.expiryTimer);
      this.expiryTimer = undefined;
    }
  }
}
