import { useCallback, useState } from "react";
import { parseBackup, type MergeMode } from "../../lib/backup";
import { exportBackupFile, pickBackupText } from "../../lib/backup-expo";
import {
  TOO_MANY_TASKS_MESSAGE,
  SAVE_FAILED_MESSAGE,
  exportErrorMessage,
  parseErrorMessage,
  pickErrorMessage,
  runImport,
  type ParsedTasks,
} from "../../lib/backup-flow";
import { useLanguage } from "../../lib/language";
import { useTasks } from "../../lib/tasks-context";

export type Notice = { tone: "success" | "error"; text: string };
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

/** State machine behind BackupSection: export, pick + parse, preview, merge or confirmed replace. */
export function useBackupActions(): BackupActions {
  const { tasks, mutate } = useTasks();
  const { t } = useLanguage();
  const [stage, setStage] = useState<ImportStage>(IDLE);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = useCallback((message: string) => setNotice({ tone: "error", text: t(message) }), [t]);

  const exportTasks = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    const result = await exportBackupFile(tasks);
    setBusy(false);
    if (result.ok) setNotice({ tone: "success", text: t("Backup exported") });
    else fail(exportErrorMessage(result.reason));
  }, [tasks, t, fail]);

  const startImport = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    setStage(IDLE);
    const picked = await pickBackupText();
    setBusy(false);
    if (!picked.ok) {
      const message = pickErrorMessage(picked.reason);
      if (message !== null) fail(message);
      return;
    }
    const parsed = parseBackup(picked.text);
    if (!parsed.ok) fail(parseErrorMessage(parsed.reason));
    else setStage({ kind: "preview", parsed });
  }, [fail]);

  const importWith = useCallback(async (mode: MergeMode) => {
    if (stage.kind === "idle") return;
    setBusy(true);
    const outcome = await runImport(mutate, stage.parsed, mode);
    setBusy(false);
    setStage(IDLE);
    if (!outcome.ok) {
      fail(outcome.reason === "too-many-tasks" ? TOO_MANY_TASKS_MESSAGE : SAVE_FAILED_MESSAGE);
      return;
    }
    const { added, updated, skipped } = outcome.summary;
    const skippedText = skipped > 0 ? `, ${skipped} ${t("tasks skipped")}` : "";
    setNotice({ tone: "success", text: `${added + updated} ${t("tasks imported")}${skippedText}` });
  }, [stage, mutate, fail, t]);

  const askToReplace = useCallback(() => {
    setStage(current => (current.kind === "preview" ? { kind: "confirm-replace", parsed: current.parsed } : current));
  }, []);

  const cancel = useCallback(() => setStage(IDLE), []);

  return { stage, notice, busy, exportTasks, startImport, importWith, askToReplace, cancel };
}
