import { BACKUP_FORMAT } from "./backup";
import { parseJson } from "./json";
import { classifyRecoveryKey } from "./recovery";
import { CYCLE_ID_PREFIX, type ReminderScheduler } from "./reminders";
import { BACKUP_KEY_PREFIX, contentKey } from "./task-storage";

/**
 * "Delete all cycle data" must not leave the data behind in the copies the app keeps for recovery: the automatic
 * snapshots, the safety copies (`dayform.tasks.backup.*`) and the tracker's own `dayform.cycle.corrupt.*` copies. This
 * module takes the tracker out of those copies and keeps everything else in them. It never touches the main keys
 * (`dayform.tasks.v1`, `dayform.cycle.v1`), the task `corrupt` copies or copies of unparseable data.
 */
export type PurgeStorage = {
  getAllKeys(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type PurgeReport = {
  /** Copies deleted: tracker corrupt copies, and copies that held nothing but the tracker. */
  removed: number;
  /** Copies rewritten without the tracker. */
  rewritten: number;
  /** Keys that could not be cleaned (still hold the tracker, or could not be read). */
  failed: string[];
  /** The key list could not be read, so nothing was attempted. */
  listFailed: boolean;
};

export type StripResult = { kind: "keep" } | { kind: "remove" } | { kind: "rewrite"; text: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * What to do with the text of a backup-format copy. Only a backup envelope that has a `cycle` field is changed:
 * the field and its health-data markers go, the rest is written back as it was (task records are not validated or
 * repaired). A copy that would hold neither a task nor categories afterwards is not worth keeping.
 */
export function stripCycleFromCopy(text: string): StripResult {
  const json = parseJson(text);
  if (!json.ok || !isRecord(json.value) || json.value.format !== BACKUP_FORMAT || !("cycle" in json.value)) return { kind: "keep" };
  const { cycle: _cycle, containsHealthData: _marker, notice: _notice, ...rest } = json.value;
  const hasTasks = Array.isArray(rest.tasks) && rest.tasks.length > 0;
  if (!hasTasks && !isRecord(rest.categories)) return { kind: "remove" };
  return { kind: "rewrite", text: JSON.stringify(rest) };
}

type Outcome = "removed" | "rewritten" | "untouched" | "failed";

async function attempt(action: () => Promise<void>): Promise<boolean> {
  try {
    await action();
    return true;
  } catch {
    return false;
  }
}

async function rewrite(storage: PurgeStorage, key: string, kind: "snapshot" | "backup", text: string): Promise<Outcome> {
  // A snapshot keeps its dated key; a safety copy is content-addressed, so its new text gets its own key.
  const target = kind === "snapshot" ? key : contentKey(BACKUP_KEY_PREFIX, text);
  if (!(await attempt(() => storage.setItem(target, text)))) return "failed";
  if (target === key) return "rewritten";
  return (await attempt(() => storage.removeItem(key))) ? "rewritten" : "failed";
}

async function cleanCopy(storage: PurgeStorage, key: string, kind: "snapshot" | "backup"): Promise<Outcome> {
  let text: string | null;
  try {
    text = await storage.getItem(key);
  } catch {
    return "failed";
  }
  if (text === null) return "untouched";
  const result = stripCycleFromCopy(text);
  if (result.kind === "keep") return "untouched";
  if (result.kind === "remove") return (await attempt(() => storage.removeItem(key))) ? "removed" : "failed";
  return rewrite(storage, key, kind, result.text);
}

async function cleanKey(storage: PurgeStorage, key: string): Promise<Outcome> {
  const info = classifyRecoveryKey(key);
  if (info === null) return "untouched";
  if (info.kind === "cycle") return (await attempt(() => storage.removeItem(key))) ? "removed" : "failed";
  if (info.kind === "snapshot" || info.kind === "backup") return cleanCopy(storage, key, info.kind);
  return "untouched";
}

/** Never throws: a failure on one key is recorded and the rest are still cleaned. */
export async function purgeCycleCopies(storage: PurgeStorage): Promise<PurgeReport> {
  let keys: readonly string[];
  try {
    keys = await storage.getAllKeys();
  } catch {
    return { removed: 0, rewritten: 0, failed: [], listFailed: true };
  }
  const report: PurgeReport = { removed: 0, rewritten: 0, failed: [], listFailed: false };
  for (const key of keys) {
    const outcome = await cleanKey(storage, key);
    if (outcome === "removed") report.removed += 1;
    else if (outcome === "rewritten") report.rewritten += 1;
    else if (outcome === "failed") report.failed.push(key);
  }
  return report;
}

/** Cancels every scheduled `dayform:cycle:*` notification (they may read "Period expected tomorrow"). True when done. */
export async function cancelCycleReminders(scheduler: ReminderScheduler): Promise<boolean> {
  try {
    const ids = (await scheduler.listScheduledIds()).filter(id => id.startsWith(CYCLE_ID_PREFIX));
    if (ids.length > 0) await scheduler.cancel(ids);
    return true;
  } catch {
    return false;
  }
}

export type DeleteAllDeps<Reason extends string = string> = {
  /** Puts the tracker back to its defaults (the store's `reset`). */
  reset: () => Promise<{ ok: true } | { ok: false; reason: Reason }>;
  storage: PurgeStorage;
  scheduler: ReminderScheduler;
  /** Removes the exported backup file left in the cache. */
  removeExportFiles: () => void;
};
export type DeleteAllOutcome<Reason extends string = string> =
  | { ok: false; reason: Reason }
  | { ok: true; purge: PurgeReport; remindersCancelled: boolean; filesRemoved: boolean };

/**
 * The whole "delete all cycle data" flow. The tracker is reset first: if that fails nothing else happens, because
 * the data is still live. Then the copies are cleaned, the scheduled notifications cancelled (directly, so it does
 * not depend on the reminders bridge, notification permission or the task store being healthy) and the cached export
 * file removed; each step runs even if an earlier one failed.
 */
export async function deleteAllCycleData<Reason extends string>(deps: DeleteAllDeps<Reason>): Promise<DeleteAllOutcome<Reason>> {
  const reset = await deps.reset();
  if (!reset.ok) return { ok: false, reason: reset.reason };
  const purge = await purgeCycleCopies(deps.storage);
  const remindersCancelled = await cancelCycleReminders(deps.scheduler);
  let filesRemoved = true;
  try {
    deps.removeExportFiles();
  } catch {
    filesRemoved = false;
  }
  return { ok: true, purge, remindersCancelled, filesRemoved };
}

/** True when the tracker was deleted but some copy, notification or file may still hold it (show a retry message). */
export function isIncomplete(outcome: DeleteAllOutcome<string>): boolean {
  if (!outcome.ok) return false;
  return outcome.purge.listFailed || outcome.purge.failed.length > 0 || !outcome.remindersCancelled || !outcome.filesRemoved;
}
