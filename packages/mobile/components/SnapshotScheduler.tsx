import { useEffect, useLayoutEffect, useRef } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { snapshotStatus } from "../lib/snapshot-status";
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
  const canSnapshot = !loading && !writesBlocked;
  const latest = useRef<SnapshotInput>({ tasks, canSnapshot });
  const runner = useRef<SnapshotRunner | null>(null);

  useLayoutEffect(() => {
    latest.current = { tasks, canSnapshot };
  }, [tasks, canSnapshot]);

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

  useEffect(() => {
    if (!canSnapshot) return undefined;
    const timer = setTimeout(() => { void runner.current?.run(); }, FIRST_SNAPSHOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canSnapshot]);

  return null;
}
