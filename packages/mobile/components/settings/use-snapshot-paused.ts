import { useSyncExternalStore } from "react";
import { snapshotStatus } from "../../lib/snapshot-status";

/** True while automatic snapshots are paused because the task list is too large for one. */
export function useSnapshotsPaused(): boolean {
  return useSyncExternalStore(snapshotStatus.subscribe, () => snapshotStatus.getState().tooLarge);
}
