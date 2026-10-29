import { describe, test, expect } from "bun:test";
import { createSnapshotStatusStore, snapshotStatus } from "./snapshot-status";
import type { SnapshotResult } from "./snapshots";

const WRITTEN: SnapshotResult = { kind: "written", key: "dayform.snapshot.2026-03-20", pruned: 0, pruneFailed: 0 };
const TOO_LARGE: SnapshotResult = { kind: "skipped", reason: "too-large" };

describe("snapshot status store", () => {
  test("starts with no result and not paused", () => {
    const store = createSnapshotStatusStore();
    expect(store.getState()).toEqual({ last: null, tooLarge: false });
  });

  test("a too-large result pauses automatic snapshots and keeps the typed result", () => {
    const store = createSnapshotStatusStore();
    store.report(TOO_LARGE);
    expect(store.getState()).toEqual({ last: TOO_LARGE, tooLarge: true });
  });

  test("a later written snapshot clears the pause; other results keep it off", () => {
    const store = createSnapshotStatusStore();
    store.report(TOO_LARGE);
    store.report(WRITTEN);
    expect(store.getState().tooLarge).toBe(false);
    store.report({ kind: "failed", reason: "write-failed" });
    expect(store.getState()).toEqual({ last: { kind: "failed", reason: "write-failed" }, tooLarge: false });
    store.report({ kind: "skipped", reason: "empty" });
    expect(store.getState().tooLarge).toBe(false);
  });

  test("a not-due skip never turns the pause on", () => {
    const store = createSnapshotStatusStore();
    store.report({ kind: "skipped", reason: "not-due" });
    expect(store.getState().tooLarge).toBe(false);
  });

  test("notifies subscribers on change, keeps getState stable when nothing changed, and unsubscribes", () => {
    const store = createSnapshotStatusStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => { calls++; });
    store.report(TOO_LARGE);
    const first = store.getState();
    expect(calls).toBe(1);
    store.report({ kind: "skipped", reason: "too-large" });
    expect(store.getState()).toBe(first);
    expect(calls).toBe(1);
    store.report(WRITTEN);
    expect(calls).toBe(2);
    unsubscribe();
    store.report(TOO_LARGE);
    expect(calls).toBe(2);
  });

  test("the shared instance is a working store", () => {
    snapshotStatus.report(WRITTEN);
    expect(snapshotStatus.getState().last).toEqual(WRITTEN);
  });
});
