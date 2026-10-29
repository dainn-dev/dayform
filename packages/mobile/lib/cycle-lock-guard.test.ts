import { describe, expect, test } from "bun:test";
import { AUTH_DENIED_MESSAGE, AUTH_PROMPT_MESSAGE, authAllows, needsCycleAuth, type CycleAuthInput } from "./cycle-lock-guard";
import { vi } from "./i18n/cycle-privacy";

const NOW = 1_000_000;
const base: CycleAuthInput = { hasData: true, lockEnabled: true, touchesTracker: true, timeoutSec: 60, unlockedAt: null, now: NOW };

describe("needsCycleAuth", () => {
  test("asks when the tracker has data, the lock is on and the screen was not unlocked", () => {
    expect(needsCycleAuth(base)).toBe(true);
  });

  test("does not ask without data, with the lock off, or when the action does not touch the tracker", () => {
    expect(needsCycleAuth({ ...base, hasData: false })).toBe(false);
    expect(needsCycleAuth({ ...base, lockEnabled: false })).toBe(false);
    expect(needsCycleAuth({ ...base, touchesTracker: false })).toBe(false);
  });

  test("an open unlock window of the cycle screen counts as verified", () => {
    expect(needsCycleAuth({ ...base, unlockedAt: NOW - 59_000 })).toBe(false);
  });

  test("a closed window asks again, and so does a window of the 'every time' setting that was left", () => {
    expect(needsCycleAuth({ ...base, unlockedAt: NOW - 60_000 })).toBe(true);
    expect(needsCycleAuth({ ...base, timeoutSec: 0, unlockedAt: null })).toBe(true);
    expect(needsCycleAuth({ ...base, timeoutSec: 0, unlockedAt: NOW - 5_000 })).toBe(false);
  });

  test("a clock that went backwards never counts as an open window", () => {
    expect(needsCycleAuth({ ...base, unlockedAt: NOW + 5_000 })).toBe(true);
  });
});

describe("authAllows", () => {
  test("lets the action go on after a success, and on a phone with no screen lock", () => {
    expect(authAllows("success")).toBe(true);
    expect(authAllows("unavailable")).toBe(true);
  });

  test("stops it after a cancel or a failure", () => {
    expect(authAllows("cancelled")).toBe(false);
    expect(authAllows("failed")).toBe(false);
  });
});

describe("messages", () => {
  test("are neutral and translated", () => {
    for (const key of [AUTH_DENIED_MESSAGE, AUTH_PROMPT_MESSAGE]) {
      expect(vi[key]).toBeTruthy();
      expect(key.toLowerCase()).not.toMatch(/period|cycle|health|tracker/);
    }
  });
});
