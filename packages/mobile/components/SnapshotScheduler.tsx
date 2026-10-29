import { useEffect, useLayoutEffect, useRef } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteStaleBackups } from "../lib/backup-expo";
import { snapshotStatus } from "../lib/snapshot-status";
import { useCategories } from "../lib/categories-context";
import { useCycle } from "../lib/cycle-context";
import { createSnapshotRunner, type SnapshotInput, type SnapshotRunner } from "../lib/snapshots";
import { useTasks } from "../lib/tasks-context";

/** Waits a little after the tasks load so the snapshot never competes with the first render. */
const FIRST_SNAPSHOT_DELAY_MS = 5_000;

/**
 * Keeps up to three rolling local snapshots (one per week at most). Renders nothing. It only runs while
 * the tasks are trustworthy (loaded and writable): a loading or partial list must never become a snapshot.
 * Every attempted result goes to `snapshotStatus`; the Recovery card shows a line only when snapshots are
 * paused because the list is too large. Other failures are retried at the next launch or foreground and
 * must not nag the user.
 */
export function SnapshotScheduler(): null {
  const { tasks, loading, writesBlocked } = useTasks();
  const { state: categoriesState, ready: categoriesReady } = useCategories();
  const { state: cycleState, ready: cycleReady, locked: cycleLocked } = useCycle();
  const canSnapshot = !loading && !writesBlocked;
  // Until the categories are read the defaults would stand in for them, so they are left out of the copy.
  const categories = categoriesReady ? categoriesState : undefined;
  // The period tracker (health data) is included once it was read safely; unreadable or still loading means left out.
  const cycle = cycleReady && !cycleLocked ? cycleState : undefined;
  const latest = useRef<SnapshotInput>({ tasks, canSnapshot, categories, cycle });
  const runner = useRef<SnapshotRunner | null>(null);

  useLayoutEffect(() => {
    latest.current = { tasks, canSnapshot, categories, cycle };
  }, [tasks, canSnapshot, categories, cycle]);

  // Mount-only: the runner and the foreground subscription stay stable across task changes.
  useEffect(() => {
    const created = createSnapshotRunner({
      storage: AsyncStorage,
      read: () => latest.current,
      now: () => new Date(),
      onResult: result => snapshotStatus.report(result),
    });
    runner.current = created;
    const subscription = AppState.addEventListener("change", state => {
      // The result is reported to `snapshotStatus` by the runner.
      if (state === "active") void created.run();
    });
    return () => {
      subscription.remove();
      created.dispose();
      runner.current = null;
    };
  }, []);

  // A backup file with tracker data is deleted right after sharing; this removes one an earlier run left behind
  // (for example when the app was killed while the share sheet was open).
  useEffect(() => { deleteStaleBackups(); }, []);

  useEffect(() => {
    if (!canSnapshot) return undefined;
    const timer = setTimeout(() => { void runner.current?.run(); }, FIRST_SNAPSHOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canSnapshot]);

  return null;
}
