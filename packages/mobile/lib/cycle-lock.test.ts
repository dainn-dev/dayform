import { describe, test, expect } from "bun:test";
import { nextUnlockState, shouldRequireUnlock } from "./cycle-lock";

const SECOND = 1000;
const T0 = 1_000_000;
const base = { lockEnabled: true, timeoutSec: 60, unlockedAt: T0, now: T0 };

describe("shouldRequireUnlock", () => {
  test("is never required when the lock is switched off", () => {
    expect(shouldRequireUnlock({ ...base, lockEnabled: false, unlockedAt: null })).toBe(false);
    expect(shouldRequireUnlock({ ...base, lockEnabled: false, now: T0 + 999 * SECOND })).toBe(false);
  });

  test("is required at cold start (never unlocked)", () => {
    expect(shouldRequireUnlock({ ...base, unlockedAt: null })).toBe(true);
  });

  test("stays unlocked for the timeout after the last unlock or activity", () => {
    expect(shouldRequireUnlock(base)).toBe(false);
    expect(shouldRequireUnlock({ ...base, now: T0 + 59 * SECOND + 999 })).toBe(false);
    expect(shouldRequireUnlock({ ...base, now: T0 + 60 * SECOND })).toBe(true);
    expect(shouldRequireUnlock({ ...base, now: T0 + 3600 * SECOND })).toBe(true);
  });

  test("works for each timeout choice", () => {
    expect(shouldRequireUnlock({ ...base, timeoutSec: 30, now: T0 + 29 * SECOND })).toBe(false);
    expect(shouldRequireUnlock({ ...base, timeoutSec: 30, now: T0 + 30 * SECOND })).toBe(true);
    expect(shouldRequireUnlock({ ...base, timeoutSec: 300, now: T0 + 299 * SECOND })).toBe(false);
    expect(shouldRequireUnlock({ ...base, timeoutSec: 300, now: T0 + 300 * SECOND })).toBe(true);
  });

  test("with timeout 0 an unlocked screen stays open until it is left", () => {
    expect(shouldRequireUnlock({ ...base, timeoutSec: 0, now: T0 + 10 * SECOND })).toBe(false);
    expect(shouldRequireUnlock({ ...base, timeoutSec: 0, unlockedAt: null })).toBe(true);
  });

  test("a clock that went backwards, or a bad timeout, requires unlock", () => {
    expect(shouldRequireUnlock({ ...base, now: T0 - 1 })).toBe(true);
    expect(shouldRequireUnlock({ ...base, timeoutSec: -5 })).toBe(true);
    expect(shouldRequireUnlock({ ...base, timeoutSec: Number.NaN })).toBe(true);
    expect(shouldRequireUnlock({ ...base, now: Number.NaN })).toBe(true);
  });
});

describe("nextUnlockState", () => {
  test("a successful unlock starts the window at now", () => {
    expect(nextUnlockState(null, { type: "unlocked", now: T0 })).toBe(T0);
    expect(nextUnlockState(T0, { type: "unlocked", now: T0 + 5 })).toBe(T0 + 5);
  });

  test("activity extends an open window", () => {
    expect(nextUnlockState(T0, { type: "activity", now: T0 + 30 * SECOND, timeoutSec: 60 })).toBe(T0 + 30 * SECOND);
  });

  test("activity never reopens a locked or expired window", () => {
    expect(nextUnlockState(null, { type: "activity", now: T0, timeoutSec: 60 })).toBeNull();
    expect(nextUnlockState(T0, { type: "activity", now: T0 + 61 * SECOND, timeoutSec: 60 })).toBeNull();
    expect(nextUnlockState(T0, { type: "activity", now: T0 + 60 * SECOND, timeoutSec: 60 })).toBeNull();
  });

  test("activity with timeout 0 keeps an open screen open", () => {
    expect(nextUnlockState(T0, { type: "activity", now: T0 + 500 * SECOND, timeoutSec: 0 })).toBe(T0 + 500 * SECOND);
  });

  test("leaving the screen locks it at once with timeout 0, otherwise keeps the window running", () => {
    expect(nextUnlockState(T0, { type: "left", timeoutSec: 0 })).toBeNull();
    expect(nextUnlockState(T0, { type: "left", timeoutSec: 60 })).toBe(T0);
    expect(nextUnlockState(null, { type: "left", timeoutSec: 60 })).toBeNull();
  });

  test("reset locks it", () => {
    expect(nextUnlockState(T0, { type: "reset" })).toBeNull();
  });
});
