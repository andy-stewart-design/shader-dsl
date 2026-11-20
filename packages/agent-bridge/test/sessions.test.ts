import { describe, expect, it } from "vitest";
import { SessionLease, type SessionClock } from "../src/session.js";

function fakeClock() {
  let now = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  let next = 1;
  const clock: SessionClock = {
    now: () => now,
    setTimeout: (callback, delay) => {
      const id = next++;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout: (handle) => timers.delete(handle as number),
  };
  return {
    clock,
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

describe("SessionLease", () => {
  it("expires from transport loss and can be consumed once", () => {
    const time = fakeClock();
    let expired = 0;
    const lease = new SessionLease({
      leaseMs: 30_000,
      clock: time.clock,
      onExpire: () => expired++,
    });
    lease.suspend({
      sessionId: "old",
      pageId: "page-1",
      pageUrl: "https://example.test/app",
      credential: "digest",
    });
    expect(lease.current?.expiresAt).toBe(30_000);
    time.advance(29_999);
    expect(lease.hasLease()).toBe(true);
    time.advance(1);
    expect(lease.hasLease()).toBe(false);
    expect(expired).toBe(1);
    expect(lease.take()).toBeUndefined();
  });

  it("revokes without leaving a timer or authority", () => {
    const time = fakeClock();
    let expired = 0;
    const lease = new SessionLease({
      clock: time.clock,
      onExpire: () => expired++,
    });
    lease.suspend({
      sessionId: "s",
      pageId: "p",
      pageUrl: "https://example.test/",
      credential: 1,
    });
    lease.revoke();
    time.advance(60_000);
    expect(lease.current).toBeUndefined();
    expect(expired).toBe(0);
  });
});
