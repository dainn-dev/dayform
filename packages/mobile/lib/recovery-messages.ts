import {
  countItem,
  importErrorMessage,
  withCategoriesNote,
  withCycleNote,
  type ImportFailure,
  type ImportSummary,
  type NoticeItem,
  type ParsedTasks,
} from "./backup-flow";
import type { DeleteResult, PreviewFailure, RecoveryItem, RecoveryKind } from "./recovery";

// The strings below are translation keys (lib/i18n/recovery.ts and lib/i18n/backup.ts); keep them in sync.

export type RecoveryNotice = { tone: "success" | "error"; parts: NoticeItem[] };
export type RestoreFailure = PreviewFailure | ImportFailure;

export const LIST_FAILED_MESSAGE = "Could not list the recovery copies.";
export const SNAPSHOTS_PAUSED_MESSAGE = "Automatic snapshots are paused: your task list is too large for a snapshot.";

const SEPARATOR = "  ·  ";
const BYTES_PER_KB = 1000;
const BYTES_PER_MB = 1_000_000;

const TENTHS_OF_KB_PER_MB = 10_000;

/** Decimal units: 1.5 KB = 1,500 bytes. Negative and non-finite sizes read as 0 B. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < BYTES_PER_KB) return `${Math.floor(bytes)} B`;
  // Round to a tenth of a KB first, so 999,950 B becomes "1.0 MB" instead of "1000.0 KB".
  const tenthsOfKb = Math.round(bytes / (BYTES_PER_KB / 10));
  if (tenthsOfKb < TENTHS_OF_KB_PER_MB) return `${(tenthsOfKb / 10).toFixed(1)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}

export function kindLabel(kind: RecoveryKind): string {
  switch (kind) {
    case "backup": return "Copy of unreadable data";
    case "corrupt": return "Records that could not be read";
    case "snapshot": return "Automatic snapshot";
    // Deliberately says nothing about what the data is: the list is visible in Settings.
    case "cycle": return "Personal data that could not be read";
  }
}

/** The one-line description of a listed copy: its size, or that it could not be read (never parsed here). */
export function itemLine(item: RecoveryItem, t: (text: string) => string): string {
  return item.unreadable ? t("Could not read this copy.") : formatBytes(item.bytes);
}

/** Parts for what a previewed copy contains; translated at render with `formatNotice`. */
export function previewSummaryParts(parsed: ParsedTasks): NoticeItem[] {
  // A copy of the tracker alone has no tasks to count.
  if (parsed.tasks.length === 0 && parsed.cycle !== undefined) return [{ key: INCLUDES_PERSONAL_DATA }];
  const parts = [countItem(parsed.tasks.length, "task in this copy", "tasks in this copy")];
  if (parsed.rejected > 0) parts.push(countItem(parsed.rejected, "task skipped", "tasks skipped"));
  if (parsed.cycle !== undefined) parts.push({ key: INCLUDES_PERSONAL_DATA });
  return parts;
}

/** Translation key (lib/i18n/cycle-notify.ts): the copy also holds the user's tracker data, which is not named here. */
export const INCLUDES_PERSONAL_DATA = "Includes personal data";
/** Translation key: the question before a replace restore of a copy that holds only tracker data. */
export const REPLACE_PERSONAL_DATA_QUESTION = "Replace all your current personal data with this copy?";
/** Translation key: the notice after a restore that touched only the tracker. */
export const PERSONAL_DATA_RESTORED = "Personal data restored";

/** True when restoring this preview changes no task, only the tracker. */
export const isPersonalDataOnly = (parsed: ParsedTasks): boolean => parsed.tasks.length === 0 && parsed.cycle !== undefined;

/** Accessibility label of a row button: the action plus which copy it acts on. */
export function itemActionLabel(action: string, item: RecoveryItem, t: (text: string) => string): string {
  return `${t(action)}: ${t(kindLabel(item.kind))} ${item.label}`;
}

/** "Label: count" keeps a natural word order in every language. */
export function summaryLine(summary: ImportSummary, t: (text: string) => string): string {
  const parts = [
    `${t("Added")}: ${summary.added}`,
    `${t("Updated")}: ${summary.updated}`,
    `${t("Unchanged")}: ${summary.unchanged}`,
    ...(summary.removed > 0 ? [`${t("Removed")}: ${summary.removed}`] : []),
  ];
  return parts.join(SEPARATOR);
}

export function restoreErrorMessage(reason: RestoreFailure): string {
  switch (reason) {
    case "not-recovery-key": return "This item is not a recovery copy.";
    case "read-failed": return "Could not read this copy.";
    case "missing": return "This copy no longer exists.";
    case "unreadable-copy": return "This copy does not contain readable tasks.";
    case "newer-version": return "This backup was made by a newer version of Dayform.";
    case "copy-too-large": return "This copy is too large to restore.";
    case "too-many-tasks":
    case "too-large":
    case "no-valid-tasks":
    case "safety-copy-failed":
    case "list-changed":
    case "save-failed": return importErrorMessage(reason);
  }
}

/** `extras.cycleOnly` is a restore that changed no task (a copy of the tracker alone). */
export function restoredNotice(
  summary: ImportSummary,
  categories?: "applied" | "failed",
  extras: { cycle?: "applied" | "failed"; cycleOnly?: boolean } = {},
): RecoveryNotice {
  if (extras.cycleOnly === true) return { tone: "success", parts: [{ key: PERSONAL_DATA_RESTORED }] };
  const parts = [countItem(summary.added + summary.updated, "task restored", "tasks restored")];
  if (summary.skipped > 0) parts.push(countItem(summary.skipped, "task skipped", "tasks skipped"));
  return { tone: "success", parts: withCycleNote(withCategoriesNote(parts, { categories }), extras) };
}

export function deleteNotice(results: readonly DeleteResult[]): RecoveryNotice {
  const deleted = results.filter(result => result.outcome === "deleted").length;
  const notDeleted = results.length - deleted;
  const parts = [countItem(deleted, "copy deleted", "copies deleted")];
  if (notDeleted === 0) return { tone: "success", parts };
  const failed = countItem(notDeleted, "copy could not be deleted", "copies could not be deleted");
  return { tone: "error", parts: deleted === 0 ? [failed] : [...parts, failed] };
}

