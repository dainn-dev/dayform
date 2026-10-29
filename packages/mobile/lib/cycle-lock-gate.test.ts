import { describe, expect, test } from "bun:test";
import { nextUnlockState } from "./cycle-lock";
import {
  ACTIVITY_THROTTLE_MS, activityEvent, appStateEvent, continueEvent, gateView, msUntilRelock, outcomeOf,
} from "./cycle-lock-gate";

const base = { ready: true, lockEnabled: true, timeoutSec: 60, unlockedAt: null as number | null, now: 1_000_000 };

describe("gateView", () => {
  test("never opens before the settings are read", () => {
    expect(gateView({ ...base, ready: false, lockEnabled: false })).toBe("loading");
  });

  test("a cold start is locked while the lock is on", () => {
    expect(gateView(base)).toBe("locked");
  });

  test("opens within the window and locks after it", () => {
    expect(gateView({ ...base, unlockedAt: base.now - 10_000 })).toBe("open");
    expect(gateView({ ...base, unlockedAt: base.now - 61_000 })).toBe("locked");
  });

  test("is open when the lock is off", () => {
    expect(gateView({ ...base, lockEnabled: false })).toBe("open");
  });
});

describe("outcomeOf", () => {
  test("only success unlocks", () => {
    expect(outcomeOf("success", 5)).toEqual({ event: { type: "unlocked", now: 5 }, notice: "none" });
    for (const status of ["cancelled", "failed", "unavailable"] as const) {
      expect(outcomeOf(status, 5)).toEqual({ event: null, notice: status });
    }
  });

  test("continuing without a phone lock unlocks for the usual window", () => {
    expect(nextUnlockState(null, continueEvent(7))).toBe(7);
  });
});

describe("appStateEvent", () => {
  test("only backgrounding counts as leaving", () => {
    expect(appStateEvent("background", 0)).toEqual({ type: "left", timeoutSec: 0 });
    expect(appStateEvent("inactive", 0)).toBeNull();
    expect(appStateEvent("active", 0)).toBeNull();
  });

  test("leaving locks at once with timeout 0 and keeps the window otherwise", () => {
    const left0 = appStateEvent("background", 0)!;
    const left60 = appStateEvent("background", 60)!;
    expect(nextUnlockState(500, left0)).toBeNull();
    expect(nextUnlockState(500, left60)).toBe(500);
  });
});

describe("msUntilRelock", () => {
  test("counts down an open window", () => {
    expect(msUntilRelock(1000, 11_000, 60)).toBe(50_000);
    expect(msUntilRelock(1000, 100_000, 60)).toBe(0);
  });

  test("has no timer when locked or without a timeout", () => {
    expect(msUntilRelock(null, 1, 60)).toBeNull();
    expect(msUntilRelock(1000, 2000, 0)).toBeNull();
  });
});

describe("activityEvent", () => {
  test("is throttled and needs an open window", () => {
    expect(activityEvent(null, 10_000, 60)).toBeNull();
    expect(activityEvent(1000, 1000 + ACTIVITY_THROTTLE_MS - 1, 60)).toBeNull();
    expect(activityEvent(1000, 1000 + ACTIVITY_THROTTLE_MS, 60)).toEqual({ type: "activity", now: 1000 + ACTIVITY_THROTTLE_MS, timeoutSec: 60 });
  });
});
