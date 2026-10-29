import type { SnapshotResult } from "./snapshots";

export type SnapshotStatus = {
  /** The last typed result of an attempted snapshot, `null` before the first one. */
  last: SnapshotResult | null;
  /** True while the newest attempt was skipped because the task list does not fit in a snapshot. */
  tooLarge: boolean;
};

export type SnapshotStatusStore = {
  getState(): SnapshotStatus;
  /** Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  report(result: SnapshotResult): void;
};

const isTooLarge = (result: SnapshotResult): boolean => result.kind === "skipped" && result.reason === "too-large";
const sameResult = (a: SnapshotResult | null, b: SnapshotResult): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b);

/**
 * Remembers the last snapshot result so the settings screen can say when automatic snapshots are paused.
 * Framework-free; `getState` keeps its identity until a different result is reported, so it is safe for
 * `useSyncExternalStore`.
 */
export function createSnapshotStatusStore(): SnapshotStatusStore {
  let state: SnapshotStatus = { last: null, tooLarge: false };
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    report(result) {
      if (sameResult(state.last, result)) return;
      state = { last: result, tooLarge: isTooLarge(result) };
      for (const listener of [...listeners]) listener();
    },
  };
}

/** The app-wide instance: written by SnapshotScheduler, read by the Recovery card. */
export const snapshotStatus: SnapshotStatusStore = createSnapshotStatusStore();
