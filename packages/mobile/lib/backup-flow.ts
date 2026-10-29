import { mergeBackup, type BackupFailure, type MergeMode } from "./backup";
import type { Task } from "./planner";
import { MAX_RECORDS } from "./task-storage";

/**
 * Largest serialized task list (UTF-8 bytes) an import may produce. AsyncStorage can write a single value
 * bigger than it can read back on Android (~2 MB window), which would lock the app at every launch.
 */
export const MAX_STORED_BYTES = 1_500_000;

export type PlanFailure = "too-many-tasks" | "too-large" | "no-valid-tasks";
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
  | { ok: false; reason: PlanFailure };
export type ParsedTasks = { tasks: readonly Task[]; rejected: number };
export type ImportOutcome =
  | { ok: true; summary: ImportSummary }
  | { ok: false; reason: PlanFailure | "save-failed" };

type ExportFailure = "sharing-unavailable" | "share-failed" | "write-failed" | "unsupported-platform";
type PickFailure = "cancelled" | "read-failed" | "too-large" | "unsupported-platform";

/** UTF-8 length of the string, as AsyncStorage will store it. A lone surrogate counts as 3 (U+FFFD). */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && isLowSurrogate(text.charCodeAt(i + 1))) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

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

function limitFailure(list: readonly Task[]): PlanFailure | null {
  if (list.length > MAX_RECORDS) return "too-many-tasks";
  return utf8Length(JSON.stringify(list)) > MAX_STORED_BYTES ? "too-large" : null;
}

/**
 * The returned `update` recomputes from whatever list the store has committed when it runs, so it is
 * safe to hand to `store.mutate`. It returns that list unchanged (a store no-op) when there is nothing
 * to change, or when the result would exceed MAX_RECORDS / MAX_STORED_BYTES (which a later launch could
 * not read back). A file without a single valid task is refused in both modes, so it can never wipe data.
 */
export function planImport(current: readonly Task[], parsed: ParsedTasks, mode: MergeMode): ImportPlan {
  if (parsed.tasks.length === 0) return { ok: false, reason: "no-valid-tasks" };
  const { list, ...summary } = summarize(current, parsed, mode);
  const failure = limitFailure(list);
  if (failure !== null) return { ok: false, reason: failure };
  return { ok: true, summary, update: committed => applyPlan(committed, parsed, mode) };
}

function applyPlan(committed: Task[], parsed: ParsedTasks, mode: MergeMode): Task[] {
  const { list, added, updated, removed } = summarize(committed, parsed, mode);
  if (limitFailure(list) !== null) return committed;
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

// The strings below are translation keys (lib/i18n/backup.ts); keep them in sync.

export function importErrorMessage(reason: PlanFailure | "save-failed"): string {
  switch (reason) {
    case "too-many-tasks": return "Importing these tasks would go over the task limit.";
    case "too-large": return "This backup is too big to store on this device.";
    case "no-valid-tasks": return "No valid tasks were found in this file.";
    case "save-failed": return "Could not save the imported tasks. Please try again.";
  }
}

/** `null` when exporting makes sense; otherwise why not (never report success for an empty list). */
export function exportBlockedMessage(loading: boolean, taskCount: number): string | null {
  if (loading) return "Your tasks are still loading. Try again in a moment.";
  return taskCount === 0 ? "There are no tasks to export." : null;
}

export function exportErrorMessage(reason: ExportFailure): string {
  switch (reason) {
    case "write-failed": return "Could not create the backup file.";
    case "sharing-unavailable": return "Sharing is not available on this device.";
    case "share-failed": return "Could not share the backup file.";
    case "unsupported-platform": return "Backup is not supported on this platform.";
  }
}

/** `null` means the user cancelled, which is not an error worth showing. */
export function pickErrorMessage(reason: PickFailure): string | null {
  switch (reason) {
    case "cancelled": return null;
    case "read-failed": return "Could not read the selected file.";
    case "too-large": return "The file is too large to import.";
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

/** A notice part: an English translation key, optionally with a leading count. Translated at render. */
export type NoticeItem = { key: string; count?: number };

/** One key per grammatical number, so no translation key ever contains an interpolated value. */
export function countItem(count: number, one: string, other: string): NoticeItem {
  return { key: count === 1 ? one : other, count };
}

export function formatNotice(items: readonly NoticeItem[], t: (text: string) => string): string {
  return items.map(item => (item.count === undefined ? t(item.key) : `${item.count} ${t(item.key)}`)).join(", ");
}
