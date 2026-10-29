import { useCallback, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteStaleBackups } from "../../lib/backup-expo";
import { useCycle } from "../../lib/cycle-context";
import { deleteAllCycleData, isIncomplete } from "../../lib/cycle-purge";
import { createExpoScheduler } from "../../lib/reminders-expo";
import { useLanguage } from "../../lib/language";
import { useCycleReport } from "./use-cycle-report";

const INCOMPLETE_MESSAGE = "Your data was deleted, but some automatic copies on this device could not be cleaned. Try again.";

/**
 * "Delete all cycle data": resets the tracker, then cleans the automatic copies, cancels the scheduled notifications
 * and removes the cached export file (see `deleteAllCycleData`). `confirm` resolves true only when everything was done;
 * when the tracker is gone but a copy could not be cleaned the dialog stays open with a retry message. Thin glue.
 */
export function useDeleteAll() {
  const { t } = useLanguage();
  const { reset } = useCycle();
  const { message, busy, run, clear } = useCycleReport();
  const [incomplete, setIncomplete] = useState(false);

  const confirm = useCallback(async (): Promise<boolean> => {
    setIncomplete(false);
    let partial = false;
    const done = await run(async () => {
      const outcome = await deleteAllCycleData({
        reset, storage: AsyncStorage, scheduler: createExpoScheduler(), removeExportFiles: deleteStaleBackups,
      });
      if (!outcome.ok) return outcome;
      partial = isIncomplete(outcome);
      return { ok: true };
    });
    setIncomplete(partial);
    return done && !partial;
  }, [reset, run]);

  const clearAll = useCallback(() => { setIncomplete(false); clear(); }, [clear]);
  return { message: message ?? (incomplete ? t(INCOMPLETE_MESSAGE) : null), busy, confirm, clear: clearAll };
}
