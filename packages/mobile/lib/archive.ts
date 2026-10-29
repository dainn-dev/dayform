import { MAX_STORED_BYTES } from "./backup-flow";
import { parseJson } from "./json";
import { addDays, dateKey, type Task } from "./planner";
import { utf8Length } from "./text-size";
import { MAX_RECORDS, taskSchema, type KeyValueStorage } from "./task-storage";
import { sameTask } from "./undo";

/** Old finished tasks live here, apart from the main list; nothing on the hot path ever reads it. */
export const ARCHIVE_KEY = "dayform.archive.v1";
/** Largest serialized archive (UTF-8 bytes) we will write; keeps a single value comfortably readable. */
export const MAX_ARCHIVE_BYTES = 1_000_000;
/**
 * A year: stats and streaks read only the main list, so a shorter archive window would cut them short.
 * The Settings button label takes this value through `archiveButtonLabel`.
 */
export const DEFAULT_ARCHIVE_DAYS = 365;

export type ArchiveFailure =
  | "nothing-to-archive" | "nothing-archived" | "too-large" | "write-failed" | "save-failed" | "corrupt" | "read-failed";
export type ArchiveParse = { ok: true; tasks: Task[] } | { ok: false; reason: "corrupt" };
export type ArchiveRead = { ok: true; tasks: Task[] } | { ok: false; reason: "corrupt" | "read-failed" };
export type ArchiveOutcome = { ok: true; archived: number; total: number } | { ok: false; reason: ArchiveFailure };
export type RestoreOutcome =
  | { ok: true; restored: number; remaining: number; archiveCleared: boolean }
  | { ok: false; reason: ArchiveFailure };
/** The slice of `TasksStore` the archive needs: a serialised, pessimistic list write. */
export type ArchiveStore = {
  mutate(update: (tasks: Task[]) => Task[], options?: { silent?: boolean }): Promise<boolean>;
};
/** `parts` are English translation keys (with optional counts); the UI translates them when rendering. */
export type ArchiveNotice = { tone: "success" | "error"; parts: { key: string; count?: number }[] };

/** Shown when an archive action fails in a way the typed outcomes do not cover. */
export const ARCHIVE_UNEXPECTED_NOTICE: ArchiveNotice = {
  tone: "error",
  parts: [{ key: "Something went wrong. Please try again." }],
};

/**
 * The day a task belongs to: its date, or the LOCAL day it was created for backlog tasks (null if
 * unreadable). `createdAt` is an ISO instant, so its UTC date prefix can be a day off near midnight.
 */
function referenceDay(task: Task): string | null {
  if (task.date !== null) return task.date;
  const created = new Date(task.createdAt);
  return Number.isNaN(created.getTime()) ? null : dateKey(created);
}

/** Done tasks whose day is more than `days` days before `today` (YYYY-MM-DD). */
export function archivable(tasks: Task[], today: string, days: number = DEFAULT_ARCHIVE_DAYS): Task[] {
  const cutoff = addDays(today, -days);
  return tasks.filter(task => {
    const day = task.status === "done" ? referenceDay(task) : null;
    return day !== null && day < cutoff;
  });
}

/**
 * What to move. `update` removes a moved task only while it is still exactly as planned, so a task that
 * was reopened or edited in the meantime stays; it returns the same list when nothing is removed.
 */
export function planArchive(
  tasks: Task[],
  today: string,
  days: number = DEFAULT_ARCHIVE_DAYS,
): { update: (tasks: Task[]) => Task[]; moved: Task[] } {
  const moved = archivable(tasks, today, days);
  const planned = new Map(moved.map(task => [task.id, task]));
  const update = (current: Task[]): Task[] => {
    const next = current.filter(task => {
      const plannedTask = planned.get(task.id);
      return plannedTask === undefined || !sameTask(plannedTask, task);
    });
    return next.length === current.length ? current : next;
  };
  return { update, moved };
}

/** A damaged archive is refused as a whole (never partly read), so that nothing is rewritten over it. */
export function parseArchive(raw: string | null): ArchiveParse {
  if (raw === null) return { ok: true, tasks: [] };
  const json = parseJson(raw);
  if (!json.ok) return { ok: false, reason: "corrupt" };
  const value = json.value;
  if (!Array.isArray(value) || value.length > MAX_RECORDS) return { ok: false, reason: "corrupt" };
  const tasks: Task[] = [];
  for (const record of value) {
    const parsed = taskSchema.safeParse(record);
    if (!parsed.success) return { ok: false, reason: "corrupt" };
    tasks.push(parsed.data);
  }
  return { ok: true, tasks: dedupeKeepingFirst(tasks) };
}

function dedupeKeepingFirst(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  return tasks.filter(task => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

export function serializeArchive(tasks: Task[]): string {
  return JSON.stringify(tasks);
}

/** Union by id: an incoming copy replaces the existing one in place; new ids are appended. */
export function mergeArchive(existing: Task[], incoming: Task[]): Task[] {
  const latest = new Map<string, Task>();
  for (const task of incoming) latest.set(task.id, task);
  const known = new Set(existing.map(task => task.id));
  const merged = existing.map(task => latest.get(task.id) ?? task);
  return [...merged, ...[...latest.values()].filter(task => !known.has(task.id))];
}

export async function readArchive(storage: KeyValueStorage): Promise<ArchiveRead> {
  let raw: string | null;
  try {
    raw = await storage.getItem(ARCHIVE_KEY);
  } catch {
    return { ok: false, reason: "read-failed" };
  }
  return parseArchive(raw);
}

async function writeArchive(storage: KeyValueStorage, tasks: Task[]): Promise<"too-large" | "write-failed" | null> {
  const raw = serializeArchive(tasks);
  if (utf8Length(raw) > MAX_ARCHIVE_BYTES) return "too-large";
  try {
    await storage.setItem(ARCHIVE_KEY, raw);
    return null;
  } catch {
    return "write-failed";
  }
}

/**
 * Archive and restore both read-modify-write the one archive key, so runs on the same storage are chained:
 * an overlapping run waits for the previous one (a failed run never breaks the chain) and then reads fresh data.
 */
const queues = new WeakMap<object, Promise<unknown>>();

function serialised<T>(storage: object, job: () => Promise<T>): Promise<T> {
  const result = (queues.get(storage) ?? Promise.resolve()).then(job);
  queues.set(storage, result.then(() => undefined, () => undefined));
  return result;
}

/**
 * Archive first (and wait for it), then remove from the store. If the store write fails the tasks simply
 * live in both places; restoring dedupes by id. Reports how many tasks the store really dropped: a task
 * edited meanwhile stays in the list (and in the archive, as an older copy that a restore ignores).
 */
export function runArchive(
  storage: KeyValueStorage,
  store: ArchiveStore,
  tasks: Task[],
  today: string,
  days: number = DEFAULT_ARCHIVE_DAYS,
): Promise<ArchiveOutcome> {
  return serialised(storage, () => archiveNow(storage, store, tasks, today, days));
}

async function archiveNow(
  storage: KeyValueStorage,
  store: ArchiveStore,
  tasks: Task[],
  today: string,
  days: number,
): Promise<ArchiveOutcome> {
  const plan = planArchive(tasks, today, days);
  if (plan.moved.length === 0) return { ok: false, reason: "nothing-to-archive" };
  const existing = await readArchive(storage);
  if (!existing.ok) return existing;
  const merged = mergeArchive(existing.tasks, plan.moved);
  const failure = await writeArchive(storage, merged);
  if (failure !== null) return { ok: false, reason: failure };
  // The store may call `update` more than once or not at all, so only the result of the last call (the one
  // computed from the list that was committed) is used, and "never called" is treated as a failed save.
  const seen: { removed: number | null } = { removed: null };
  const saved = await store.mutate(current => {
    const next = plan.update(current);
    seen.removed = current.length - next.length;
    return next;
  }, { silent: true });
  if (!saved || seen.removed === null) return { ok: false, reason: "save-failed" };
  return { ok: true, archived: seen.removed, total: merged.length };
}

type RestoreStep = { next: Task[]; ids: Set<string> };

/**
 * Adds archived tasks the list lacks, in archive order, while both limits hold: MAX_RECORDS tasks and a
 * serialized list of at most MAX_STORED_BYTES (a bigger value could be written but not read back on Android,
 * which would lock the app at every launch). A task that does not fit is skipped; smaller ones may still fit.
 */
function restoreInto(current: Task[], archived: Task[]): RestoreStep {
  const present = new Set(current.map(task => task.id));
  let bytes = utf8Length(JSON.stringify(current));
  let count = current.length;
  const added: Task[] = [];
  for (const task of archived) {
    if (count >= MAX_RECORDS) break;
    if (present.has(task.id)) continue;
    const size = utf8Length(JSON.stringify(task)) + (count > 0 ? 1 : 0);
    if (bytes + size > MAX_STORED_BYTES) continue;
    bytes += size;
    count += 1;
    added.push(task);
  }
  const next = added.length === 0 ? current : [...current, ...added];
  return { next, ids: new Set(next.map(task => task.id)) };
}

/**
 * Merges archived tasks back into the list (live copies win; as many as fit under the task and size
 * limits), then drops the restored ones from the archive. The store is written first, so a failed cleanup
 * only leaves duplicates; whatever did not fit stays in the archive.
 */
export function runRestore(storage: KeyValueStorage, store: ArchiveStore): Promise<RestoreOutcome> {
  return serialised(storage, () => restoreNow(storage, store));
}

async function restoreNow(storage: KeyValueStorage, store: ArchiveStore): Promise<RestoreOutcome> {
  const archive = await readArchive(storage);
  if (!archive.ok) return archive;
  if (archive.tasks.length === 0) return { ok: false, reason: "nothing-archived" };
  // See archiveNow: the last call of `update` wins, and "never called" is a failed save.
  const seen: { step: RestoreStep | null; before: number } = { step: null, before: 0 };
  const saved = await store.mutate(current => {
    seen.step = restoreInto(current, archive.tasks);
    seen.before = current.length;
    return seen.step.next;
  }, { silent: true });
  if (!saved || seen.step === null) return { ok: false, reason: "save-failed" };
  const { next, ids } = seen.step;
  const left = archive.tasks.filter(task => !ids.has(task.id));
  const cleared = left.length === archive.tasks.length || (await writeArchive(storage, left)) === null;
  return { ok: true, restored: next.length - seen.before, remaining: left.length, archiveCleared: cleared };
}

const FAILURE_MESSAGES: Record<ArchiveFailure, string> = {
  "nothing-to-archive": "There are no old completed tasks to archive.",
  "nothing-archived": "The archive is empty.",
  "too-large": "The archive is full, so nothing was archived.",
  "write-failed": "Could not write the archive. Your tasks were not changed.",
  "save-failed": "Your tasks could not be updated. Nothing was lost.",
  "corrupt": "The archive could not be read, so it was left untouched.",
  "read-failed": "Could not read the archive.",
};

const counted = (n: number, one: string, many: string): { key: string; count?: number } => ({ key: n === 1 ? one : many, count: n });

/** Translation-key parts describing an outcome; format with `formatNotice` from lib/backup-flow. */
export function archiveNotice(outcome: ArchiveOutcome | RestoreOutcome): ArchiveNotice {
  if (!outcome.ok) {
    const neutral = outcome.reason === "nothing-to-archive" || outcome.reason === "nothing-archived";
    return { tone: neutral ? "success" : "error", parts: [{ key: FAILURE_MESSAGES[outcome.reason] }] };
  }
  if ("archived" in outcome) return { tone: "success", parts: [counted(outcome.archived, "task archived", "tasks archived")] };
  const parts = [counted(outcome.restored, "task restored", "tasks restored")];
  if (outcome.remaining > 0) {
    parts.push(counted(outcome.remaining, "task stays in the archive because there is no room left", "tasks stay in the archive because there is no room left"));
  }
  if (!outcome.archiveCleared) parts.push({ key: "The archive copy could not be cleared." });
  return { tone: "success", parts };
}

/** The Settings button label; the number of days comes from DEFAULT_ARCHIVE_DAYS, never from the text. */
export function archiveButtonLabel(t: (text: string) => string): string {
  return t("Archive tasks completed more than {n} days ago").replace("{n}", String(DEFAULT_ARCHIVE_DAYS));
}
