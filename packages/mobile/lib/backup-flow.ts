import { mergeBackup, type BackupFailure, type MergeMode } from "./backup";
import type { Task } from "./planner";
import { MAX_RECORDS } from "./task-storage";

// These strings are translation keys (lib/i18n/backup.ts); keep them in sync.
export const TOO_MANY_TASKS_MESSAGE = "Importing these tasks would go over the task limit.";
export const SAVE_FAILED_MESSAGE = "Could not save the imported tasks. Please try again.";

export type ImportSummary = {
  /** Valid tasks in the file. */
  found: number;
  /** Records in the file that were invalid or duplicated. */
  skipped: number;
  added: number;
  updated: number;
  unchanged: number;
  /** Current tasks that disappear (replace mode only). */
  removed: number;
  /** Size of the list after the import. */
  resulting: number;
};
export type ImportPlan =
  | { ok: true; update: (tasks: Task[]) => Task[]; summary: ImportSummary }
  | { ok: false; reason: "too-many-tasks" };
export type ParsedTasks = { tasks: readonly Task[]; rejected: number };
export type ImportOutcome =
  | { ok: true; summary: ImportSummary }
  | { ok: false; reason: "too-many-tasks" | "save-failed" };

type ExportFailure = "sharing-unavailable" | "write-failed" | "unsupported-platform";
type PickFailure = "cancelled" | "read-failed" | "unsupported-platform";

function summarize(current: readonly Task[], parsed: ParsedTasks, mode: MergeMode): ImportSummary & { list: Task[] } {
  const merged = mergeBackup(current, parsed.tasks, mode);
  const incomingIds = new Set(parsed.tasks.map(item => item.id));
  const removed = mode === "replace" ? current.filter(item => !incomingIds.has(item.id)).length : 0;
  return {
    found: parsed.tasks.length,
    skipped: parsed.rejected,
    added: merged.added,
    updated: merged.updated,
    unchanged: merged.unchanged,
    removed,
    resulting: merged.tasks.length,
    list: merged.tasks,
  };
}

/**
 * The returned `update` recomputes from whatever list the store has committed when it runs, so it is
 * safe to hand to `store.mutate`. It returns that list unchanged (a store no-op) when there is nothing
 * to change, or when the result would exceed MAX_RECORDS (which `loadTasks` would treat as corrupt).
 */
export function planImport(current: readonly Task[], parsed: ParsedTasks, mode: MergeMode): ImportPlan {
  const { list, ...summary } = summarize(current, parsed, mode);
  if (list.length > MAX_RECORDS) return { ok: false, reason: "too-many-tasks" };
  return { ok: true, summary, update: committed => applyPlan(committed, parsed, mode) };
}

function applyPlan(committed: Task[], parsed: ParsedTasks, mode: MergeMode): Task[] {
  const { list, added, updated, removed } = summarize(committed, parsed, mode);
  if (list.length > MAX_RECORDS) return committed;
  return added + updated + removed === 0 ? committed : list;
}

/** Commits an import through `mutate`, reporting why nothing was written when it could not be. */
export async function runImport(
  mutate: (update: (tasks: Task[]) => Task[]) => Promise<boolean>,
  parsed: ParsedTasks,
  mode: MergeMode,
): Promise<ImportOutcome> {
  let plan: ImportPlan | null = null;
  const saved = await mutate(committed => {
    plan = planImport(committed, parsed, mode);
    return plan.ok ? plan.update(committed) : committed;
  });
  const result = plan as ImportPlan | null;
  if (result !== null && !result.ok) return { ok: false, reason: result.reason };
  if (!saved || result === null) return { ok: false, reason: "save-failed" };
  return { ok: true, summary: result.summary };
}

export function exportErrorMessage(reason: ExportFailure): string {
  switch (reason) {
    case "write-failed": return "Could not create the backup file.";
    case "sharing-unavailable": return "Sharing is not available on this device.";
    case "unsupported-platform": return "Backup is not supported on this platform.";
  }
}

/** `null` means the user cancelled, which is not an error worth showing. */
export function pickErrorMessage(reason: PickFailure): string | null {
  switch (reason) {
    case "cancelled": return null;
    case "read-failed": return "Could not read the selected file.";
    case "unsupported-platform": return "Backup is not supported on this platform.";
  }
}

export function parseErrorMessage(reason: BackupFailure): string {
  switch (reason) {
    case "invalid-json":
    case "wrong-format": return "This file is not a Dayform backup.";
    case "unsupported-version": return "This backup was made by a newer version of Dayform.";
    case "too-large": return "The file is too large to import.";
  }
}
