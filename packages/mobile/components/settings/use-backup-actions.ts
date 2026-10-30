import { useCallback, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseBackup, type MergeMode } from "../../lib/backup";
import { exportBackupFile, pickBackupText } from "../../lib/backup-expo";
import {
  countItem,
  exportBlockedMessage,
  exportErrorMessage,
  importErrorMessage,
  parseErrorMessage,
  pickErrorMessage,
  runImport,
  type NoticeItem,
  type ParsedTasks,
  withCategoriesNote,
  withSpecialDaysNote,
  withCycleNote,
} from "../../lib/backup-flow";
import { useCategories } from "../../lib/categories-context";
import { useSpecialDays } from "../../lib/special-days-context";
import { hasCycleData } from "../../lib/cycle";
import { useCycle } from "../../lib/cycle-context";
import { AUTH_DENIED_MESSAGE } from "../../lib/cycle-lock-guard";
import { PERSONAL_DATA_RESTORED, SPECIAL_DAYS_RESTORED } from "../../lib/recovery-messages";
import { useTasks } from "../../lib/tasks-context";
import { useCycleAuth } from "./use-cycle-auth";

/** `parts` are English translation keys (with optional counts); the UI translates them when rendering. */
export type Notice = { tone: "success" | "error"; parts: NoticeItem[] };
export type ImportStage =
  | { kind: "idle" }
  | { kind: "preview"; parsed: ParsedTasks }
  | { kind: "confirm-replace"; parsed: ParsedTasks };

const IDLE: ImportStage = { kind: "idle" };

export type BackupActions = {
  stage: ImportStage;
  notice: Notice | null;
  busy: boolean;
  /** The next export will contain the period tracker (health data): the screen must say so. */
  includesHealthData: boolean;
  exportTasks: () => Promise<void>;
  startImport: () => Promise<void>;
  importWith: (mode: MergeMode) => Promise<void>;
  askToReplace: () => void;
  cancel: () => void;
};

const failure = (message: string): Notice => ({ tone: "error", parts: [{ key: message }] });

function importedNotice(
  imported: number,
  skipped: number,
  extras: { categories?: "applied" | "failed"; specialDays?: "applied" | "failed"; cycle?: "applied" | "failed"; cycleOnly?: true; specialDaysOnly?: true },
): Notice {
  // A file with the tracker alone changed no task.
  if (extras.cycleOnly === true) return { tone: "success", parts: [{ key: PERSONAL_DATA_RESTORED }] };
  if (extras.specialDaysOnly === true) return { tone: "success", parts: [{ key: SPECIAL_DAYS_RESTORED }] };
  const parts = [countItem(imported, "task imported", "tasks imported")];
  if (skipped > 0) parts.push(countItem(skipped, "task skipped", "tasks skipped"));
  return { tone: "success", parts: withCycleNote(withSpecialDaysNote(withCategoriesNote(parts, extras), extras), extras) };
}

/** State machine behind BackupSection: export, pick + parse, preview, merge or confirmed replace. */
export function useBackupActions(): BackupActions {
  const { tasks, loading, mutate } = useTasks();
  const { state: categoriesState, importState } = useCategories();
  const { items: specialItems, importState: importSpecialDays } = useSpecialDays();
  const specialDays = useMemo(() => ({ items: [...specialItems] }), [specialItems]);
  const { state: cycleState, ready: cycleReady, locked: cycleLocked, importState: importCycle } = useCycle();
  // Until the tracker is read (or if it could not be) the defaults would stand in for it, so it is left out.
  const cycle = cycleReady && !cycleLocked ? cycleState : undefined;
  const includesHealthData = cycle !== undefined && hasCycleData(cycle);
  const authorize = useCycleAuth();
  const [stage, setStage] = useState<ImportStage>(IDLE);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const exportTasks = useCallback(async () => {
    setNotice(null);
    const blocked = exportBlockedMessage(loading, tasks.length, includesHealthData);
    if (blocked !== null) {
      setNotice(failure(blocked));
      return;
    }
    setBusy(true);
    try {
      // An export that includes the tracker needs the same check as opening it.
      if (includesHealthData && !(await authorize())) {
        setNotice(failure(AUTH_DENIED_MESSAGE));
        return;
      }
      const result = await exportBackupFile(tasks, categoriesState, cycle, specialDays);
      setNotice(result.ok ? { tone: "success", parts: [{ key: "Backup exported" }] } : failure(exportErrorMessage(result.reason)));
    } finally {
      setBusy(false);
    }
  }, [tasks, loading, categoriesState, cycle, specialDays, includesHealthData, authorize]);

  const startImport = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    setStage(IDLE);
    try {
      const picked = await pickBackupText();
      if (!picked.ok) {
        const message = pickErrorMessage(picked.reason);
        if (message !== null) setNotice(failure(message));
        return;
      }
      const parsed = parseBackup(picked.text);
      if (parsed.ok) setStage({ kind: "preview", parsed });
      else setNotice(failure(parseErrorMessage(parsed.reason)));
    } finally {
      setBusy(false);
    }
  }, []);

  const importWith = useCallback(async (mode: MergeMode) => {
    if (stage.kind === "idle") return;
    setBusy(true);
    try {
      const outcome = await runImport(mutate, stage.parsed, mode, {
        storage: AsyncStorage, now: new Date(), categories: categoriesState, importCategories: importState, specialDays, importSpecialDays,
        cycle, importCycle, authorize,
      });
      setStage(IDLE);
      if (!outcome.ok) setNotice(failure(importErrorMessage(outcome.reason)));
      else setNotice(importedNotice(outcome.summary.added + outcome.summary.updated, outcome.summary.skipped, outcome));
    } finally {
      setBusy(false);
    }
  }, [stage, mutate, categoriesState, importState, specialDays, importSpecialDays, cycle, importCycle, authorize]);

  const askToReplace = useCallback(() => {
    setStage(current => (current.kind === "preview" ? { kind: "confirm-replace", parsed: current.parsed } : current));
  }, []);

  const cancel = useCallback(() => setStage(IDLE), []);

  return { stage, notice, busy, includesHealthData, exportTasks, startImport, importWith, askToReplace, cancel };
}
