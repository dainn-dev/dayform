import { useCallback, useState } from "react";
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
} from "../../lib/backup-flow";
import { useTasks } from "../../lib/tasks-context";

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
  exportTasks: () => Promise<void>;
  startImport: () => Promise<void>;
  importWith: (mode: MergeMode) => Promise<void>;
  askToReplace: () => void;
  cancel: () => void;
};

const failure = (message: string): Notice => ({ tone: "error", parts: [{ key: message }] });

function importedNotice(imported: number, skipped: number): Notice {
  const parts = [countItem(imported, "task imported", "tasks imported")];
  if (skipped > 0) parts.push(countItem(skipped, "task skipped", "tasks skipped"));
  return { tone: "success", parts };
}

/** State machine behind BackupSection: export, pick + parse, preview, merge or confirmed replace. */
export function useBackupActions(): BackupActions {
  const { tasks, loading, mutate } = useTasks();
  const [stage, setStage] = useState<ImportStage>(IDLE);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const exportTasks = useCallback(async () => {
    setNotice(null);
    const blocked = exportBlockedMessage(loading, tasks.length);
    if (blocked !== null) {
      setNotice(failure(blocked));
      return;
    }
    setBusy(true);
    try {
      const result = await exportBackupFile(tasks);
      setNotice(result.ok ? { tone: "success", parts: [{ key: "Backup exported" }] } : failure(exportErrorMessage(result.reason)));
    } finally {
      setBusy(false);
    }
  }, [tasks, loading]);

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
      const outcome = await runImport(mutate, stage.parsed, mode);
      setStage(IDLE);
      if (!outcome.ok) setNotice(failure(importErrorMessage(outcome.reason)));
      else setNotice(importedNotice(outcome.summary.added + outcome.summary.updated, outcome.summary.skipped));
    } finally {
      setBusy(false);
    }
  }, [stage, mutate]);

  const askToReplace = useCallback(() => {
    setStage(current => (current.kind === "preview" ? { kind: "confirm-replace", parsed: current.parsed } : current));
  }, []);

  const cancel = useCallback(() => setStage(IDLE), []);

  return { stage, notice, busy, exportTasks, startImport, importWith, askToReplace, cancel };
}
