import type { CategoriesState } from "./categories";
import { hasCycleData, type CycleState } from "./cycle";
import { AUTH_DENIED_MESSAGE } from "./cycle-lock-guard";
import { mergeBackup, serializeBackup, type BackupFailure, type MergeMode } from "./backup";
import type { Task } from "./planner";
import { utf8Length } from "./text-size";
import { BACKUP_KEY_PREFIX, MAX_RECORDS, contentKey } from "./task-storage";

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
/** `categories` is set when the file carried a categories object; it is applied after the tasks, in the same mode. */
export type ParsedTasks = { tasks: readonly Task[]; rejected: number; categories?: CategoriesState; cycle?: CycleState };
export type ImportFailure = PlanFailure | "save-failed" | "safety-copy-failed" | "list-changed" | "auth-denied";
/**
 * `categories` / `cycle` are only set when the file had them and the caller could apply them. `cycle` is the private
 * period tracker: it is applied last, and a failure there never undoes the tasks or the categories.
 */
export type ImportOutcome =
  | { ok: true; summary: ImportSummary; categories?: "applied" | "failed"; cycle?: "applied" | "failed"; cycleOnly?: true }
  | { ok: false; reason: ImportFailure };
/** Where (and when) the safety copy taken before a replace is written. */
export type SafetyCopyTarget = {
  storage: { setItem(key: string, value: string): Promise<void> };
  now: Date;
  /** The current categories, saved in the copy too (only when customised) so a restore can bring them back. */
  categories?: CategoriesState;
  /** The current tracker data, saved in the copy too (only when it holds any) so a restore can bring it back. */
  cycle?: CycleState;
};
/** What `runImport` needs besides the task store: the safety-copy target and, optionally, how to apply categories and tracker data. */
export type ImportTarget = SafetyCopyTarget & {
  importCategories?: (incoming: CategoriesState, mode: MergeMode) => Promise<{ ok: boolean }>;
  importCycle?: (incoming: CycleState, mode: MergeMode) => Promise<{ ok: boolean }>;
  /**
   * Asked once, before anything is read or written, when the import would write tracker data (the file has some and
   * `importCycle` is given). Resolves true when the user may go on (verified, or no check is needed); false or a
   * throw refuses the import with `auth-denied`.
   */
  authorize?: () => Promise<boolean>;
};
export type ImportMutate = (
  update: (tasks: Task[]) => Task[],
  options?: { undo?: "bulk"; silent?: boolean },
) => Promise<boolean>;

type ExportFailure = "sharing-unavailable" | "share-failed" | "write-failed" | "unsupported-platform";
type PickFailure = "cancelled" | "read-failed" | "too-large" | "unsupported-platform";

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

/**
 * Commits one import turn through `mutate`. The store may call `update` more than once or not at all, so
 * only the last call counts and "never called" is a failed save. With `expected`, the update refuses to
 * touch any list other than the one the safety copy was made from.
 */
async function commitImport(
  mutate: ImportMutate,
  parsed: ParsedTasks,
  mode: MergeMode,
  expected: readonly Task[] | null,
): Promise<ImportOutcome> {
  const seen: { plan: ImportPlan | null; changed: boolean } = { plan: null, changed: false };
  // An import (especially "replace") can change many tasks at once, so offer to undo it.
  const saved = await mutate(committed => {
    seen.changed = expected !== null && committed !== expected;
    seen.plan = seen.changed ? null : planImport(committed, parsed, mode);
    return seen.plan !== null && seen.plan.ok ? seen.plan.update(committed) : committed;
  }, { undo: "bulk" });
  if (seen.changed) return { ok: false, reason: "list-changed" };
  if (seen.plan !== null && !seen.plan.ok) return { ok: false, reason: seen.plan.reason };
  if (!saved || seen.plan === null) return { ok: false, reason: "save-failed" };
  return { ok: true, summary: seen.plan.summary };
}

/** Writes the list as a compact backup under a content-addressed recovery key (same scheme as loadTasks). */
async function writeSafetyCopy(target: SafetyCopyTarget, tasks: readonly Task[]): Promise<boolean> {
  const text = serializeBackup(tasks, target.now, { compact: true, categories: target.categories, cycle: target.cycle });
  try {
    await target.storage.setItem(contentKey(BACKUP_KEY_PREFIX, text), text);
    return true;
  } catch {
    return false;
  }
}

/**
 * A replace discards every current task that is not in the file, so the committed list is first read (a
 * silent no-op turn), saved as a recovery copy, and only then replaced, and only if the list is still the
 * one that was copied. A refused plan writes no copy; a failed copy refuses the replace.
 */
async function runReplace(mutate: ImportMutate, parsed: ParsedTasks, safety: SafetyCopyTarget): Promise<ImportOutcome> {
  const seen: { list: Task[] | null } = { list: null };
  const read = await mutate(committed => {
    seen.list = committed;
    return committed;
  }, { silent: true });
  const current = seen.list;
  if (!read || current === null) return { ok: false, reason: "save-failed" };
  const plan = planImport(current, parsed, "replace");
  if (!plan.ok) return { ok: false, reason: plan.reason };
  if (worthSafetyCopy(current, parsed, safety) && !(await writeSafetyCopy(safety, current))) return { ok: false, reason: "safety-copy-failed" };
  return commitImport(mutate, parsed, "replace", current);
}

/**
 * Tasks to lose, or a tracker with data that the file is about to overwrite: either needs a copy. An empty list
 * next to an untouched tracker has nothing to protect.
 */
function worthSafetyCopy(current: readonly Task[], parsed: ParsedTasks, safety: SafetyCopyTarget): boolean {
  return current.length > 0 || (parsed.cycle !== undefined && safety.cycle !== undefined && hasCycleData(safety.cycle));
}

async function applyOptional<T>(
  incoming: T | undefined,
  apply: ((incoming: T, mode: MergeMode) => Promise<{ ok: boolean }>) | undefined,
  mode: MergeMode,
): Promise<"applied" | "failed" | null> {
  if (incoming === undefined || apply === undefined) return null;
  try {
    return (await apply(incoming, mode)).ok ? "applied" : "failed";
  } catch {
    return "failed";
  }
}

const NO_TASKS_SUMMARY: ImportSummary = { found: 0, skipped: 0, added: 0, updated: 0, unchanged: 0, removed: 0, resulting: 0 };

type CycleOnlyTarget = SafetyCopyTarget & { importCycle: NonNullable<ImportTarget["importCycle"]> };

/**
 * A file or copy that holds tracker data and no task goes straight to the tracker: no task is read or written.
 * A replace overwrites the tracker, so the current data is first saved as a compact backup (no tasks, only the
 * tracker) under a backup key; that copy restores through this same path. A failed copy refuses the replace.
 */
export async function runCycleOnlyImport(incoming: CycleState, mode: MergeMode, target: CycleOnlyTarget): Promise<ImportOutcome> {
  if (mode === "replace" && target.cycle !== undefined && hasCycleData(target.cycle)) {
    const text = serializeBackup([], target.now, { compact: true, cycle: target.cycle });
    try {
      await target.storage.setItem(contentKey(BACKUP_KEY_PREFIX, text), text);
    } catch {
      return { ok: false, reason: "safety-copy-failed" };
    }
  }
  try {
    if ((await target.importCycle(incoming, mode)).ok) return { ok: true, summary: NO_TASKS_SUMMARY, cycle: "applied", cycleOnly: true };
  } catch {
    // Reported as a failed save below.
  }
  return { ok: false, reason: "save-failed" };
}

async function authorized(authorize: (() => Promise<boolean>) | undefined): Promise<boolean> {
  if (authorize === undefined) return true;
  try {
    return await authorize();
  } catch {
    return false;
  }
}

/**
 * Commits an import through `mutate`, reporting why nothing was written when it could not be. When the import would
 * write tracker data, `target.authorize` is asked first. The file's categories and then its tracker data (when it
 * has any and the matching hook is given) are applied only after the tasks were saved, so a refused import never
 * changes them; each step is independent: if one fails the outcome says so and the others stay applied.
 */
export async function runImport(
  mutate: ImportMutate,
  parsed: ParsedTasks,
  mode: MergeMode,
  target: ImportTarget,
): Promise<ImportOutcome> {
  const { importCycle } = target;
  const incomingCycle = importCycle === undefined ? undefined : parsed.cycle;
  if (incomingCycle !== undefined && !(await authorized(target.authorize))) return { ok: false, reason: "auth-denied" };
  if (incomingCycle !== undefined && importCycle !== undefined && parsed.tasks.length === 0) {
    return runCycleOnlyImport(incomingCycle, mode, { ...target, importCycle });
  }
  const outcome = mode === "replace" ? await runReplace(mutate, parsed, target) : await commitImport(mutate, parsed, mode, null);
  if (!outcome.ok) return outcome;
  const categories = await applyOptional(parsed.categories, target.importCategories, mode);
  const cycle = await applyOptional(parsed.cycle, importCycle, mode);
  return { ...outcome, ...(categories === null ? {} : { categories }), ...(cycle === null ? {} : { cycle }) };
}

// The strings below are translation keys (lib/i18n/backup.ts, lib/i18n/cycle-privacy.ts); keep them in sync.

/** Translation key: shown in the import panel while the file carries tracker data. */
export const IMPORT_HAS_TRACKER_NOTE = "This file also has period tracker data.";

/** The confirmation before a replace import. It names the tracker whenever the file carries tracker data. */
export function replaceImportQuestion(parsed: Pick<ParsedTasks, "tasks" | "cycle">): string {
  if (parsed.cycle === undefined) return "Replace all your current tasks?";
  return parsed.tasks.length === 0
    ? "Replace your current period tracker history?"
    : "Replace all your current tasks and your period tracker history?";
}


export function importErrorMessage(reason: ImportFailure): string {
  switch (reason) {
    case "too-many-tasks": return "Importing these tasks would go over the task limit.";
    case "too-large": return "This backup is too big to store on this device.";
    case "no-valid-tasks": return "No valid tasks were found in this file.";
    case "save-failed": return "Could not save the imported tasks. Please try again.";
    case "safety-copy-failed": return "Could not save a safety copy of your current tasks, so nothing was replaced.";
    case "list-changed": return "Your tasks changed while restoring, so nothing was replaced. Please try again.";
    case "auth-denied": return AUTH_DENIED_MESSAGE;
  }
}

/**
 * `null` when exporting makes sense; otherwise why not (never report success for an empty list). A tracker with data
 * counts as something to export: a user who only tracks periods can still back up.
 */
export function exportBlockedMessage(loading: boolean, taskCount: number, hasTrackerData = false): string | null {
  if (loading) return "Your tasks are still loading. Try again in a moment.";
  return taskCount === 0 && !hasTrackerData ? "There are no tasks to export." : null;
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

/** Translation key (lib/i18n/category-usage.ts) shown after an import whose categories could not be saved. */
export const CATEGORIES_NOT_RESTORED = "Categories could not be restored";

/** `parts` plus a note when the outcome says the file's categories failed to apply; unchanged otherwise. */
export function withCategoriesNote(parts: readonly NoticeItem[], outcome: { categories?: "applied" | "failed" }): NoticeItem[] {
  return outcome.categories === "failed" ? [...parts, { key: CATEGORIES_NOT_RESTORED }] : [...parts];
}

/** Translation key (lib/i18n/cycle-notify.ts) shown next to Export while the file would contain the period tracker. */
export const HEALTH_DATA_WARNING = "This file includes health data (period tracker) and is not encrypted. Share it only with people you trust.";

/** Translation key (lib/i18n/cycle-notify.ts) shown after an import whose tracker data could not be saved. */
export const CYCLE_NOT_RESTORED = "Personal data could not be restored";

/** `parts` plus a note when the outcome says the file's tracker data failed to apply; unchanged otherwise. */
export function withCycleNote(parts: readonly NoticeItem[], outcome: { cycle?: "applied" | "failed" }): NoticeItem[] {
  return outcome.cycle === "failed" ? [...parts, { key: CYCLE_NOT_RESTORED }] : [...parts];
}

/** One key per grammatical number, so no translation key ever contains an interpolated value. */
export function countItem(count: number, one: string, other: string): NoticeItem {
  return { key: count === 1 ? one : other, count };
}

export function formatNotice(items: readonly NoticeItem[], t: (text: string) => string): string {
  return items.map(item => (item.count === undefined ? t(item.key) : `${item.count} ${t(item.key)}`)).join(", ");
}
