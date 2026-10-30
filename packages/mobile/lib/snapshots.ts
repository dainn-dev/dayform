import { serializeBackup } from "./backup";
import type { CategoriesState } from "./categories";
import type { SpecialDaysState } from "./special-days";
import { hasCycleData, type CycleState } from "./cycle";
import { dateKey, fromKey, type Task } from "./planner";
import { utf8Length } from "./text-size";

/** Automatic local snapshots: `dayform.snapshot.<YYYY-MM-DD>` (local date), value = a backup file's text. */
export const SNAPSHOT_KEY_PREFIX = "dayform.snapshot.";
/** AsyncStorage's total budget is ~6 MB, so one snapshot may never be bigger than this (UTF-8 bytes). */
export const MAX_SNAPSHOT_BYTES = 500_000;
export const DEFAULT_MIN_INTERVAL_DAYS = 7;
export const DEFAULT_KEEP = 3;
/**
 * A lower bound for one serialized task in a compact backup (the smallest schema-valid task is ~120 bytes
 * with its comma). A list longer than MAX_SNAPSHOT_BYTES / this cannot fit, so it is refused without
 * serializing it.
 */
export const MIN_TASK_JSON_BYTES = 100;

const MS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type SnapshotStorage = {
  getAllKeys(): Promise<readonly string[]>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type SnapshotSkipReason = "empty" | "not-due" | "too-large";
export type SnapshotFailReason = "invalid-date" | "list-failed" | "write-failed";
export type SnapshotResult =
  | { kind: "written"; key: string; pruned: number; pruneFailed: number }
  | { kind: "skipped"; reason: SnapshotSkipReason }
  | { kind: "failed"; reason: SnapshotFailReason };

export function snapshotKey(date: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${date}`;
}

/** The date in a snapshot key, or `null` when the key is not a snapshot key with a real calendar date. */
export function snapshotDateFromKey(key: string): string | null {
  if (!key.startsWith(SNAPSHOT_KEY_PREFIX)) return null;
  const date = key.slice(SNAPSHOT_KEY_PREFIX.length);
  return DATE_PATTERN.test(date) && dateKey(fromKey(date)) === date ? date : null;
}

function snapshotDates(keys: readonly string[]): string[] {
  return keys.flatMap(key => snapshotDateFromKey(key) ?? []);
}

function daysBetween(from: string, to: string): number {
  return Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / MS_PER_DAY);
}

/**
 * True when no snapshot dated on or before `today` is newer than `minIntervalDays`. Snapshots dated in
 * the future (a wrong clock once) are ignored so they cannot stall the schedule.
 */
export function shouldSnapshot(
  existingKeys: readonly string[],
  today: string,
  minIntervalDays: number = DEFAULT_MIN_INTERVAL_DAYS,
): boolean {
  const past = snapshotDates(existingKeys).filter(date => date <= today).sort();
  const newest = past[past.length - 1];
  return newest === undefined || daysBetween(newest, today) >= minIntervalDays;
}

/**
 * Snapshot keys to delete, oldest first: every key dated after `today` (a wrong clock once; they are
 * treated as the oldest and never count toward `keep`), then the oldest dated up to `today` so only the
 * newest `keep` of those remain. Only well-formed snapshot keys are ever returned. An invalid `keep`
 * (below 1, fractional, NaN) falls back to the default so the last snapshot can never be pruned.
 */
export function planSnapshotPrune(keys: readonly string[], today: string, keep: number = DEFAULT_KEEP): string[] {
  const limit = Number.isInteger(keep) && keep >= 1 ? keep : DEFAULT_KEEP;
  const snapshots = keys.flatMap(key => {
    const date = snapshotDateFromKey(key);
    return date === null ? [] : [{ key, date }];
  });
  // A snapshot key is prefix + date, so a date-only sort is total.
  snapshots.sort((a, b) => a.date.localeCompare(b.date));
  const future = snapshots.filter(item => item.date > today);
  const past = snapshots.filter(item => item.date <= today);
  const surplus = past.slice(0, Math.max(0, past.length - limit));
  return [...future, ...surplus].map(item => item.key);
}

async function pruneSnapshots(
  storage: SnapshotStorage,
  keys: readonly string[],
  today: string,
): Promise<{ pruned: number; pruneFailed: number }> {
  let pruned = 0;
  let pruneFailed = 0;
  for (const key of planSnapshotPrune(keys, today)) {
    try {
      await storage.removeItem(key);
      pruned++;
    } catch {
      // A snapshot that cannot be pruned is only wasted space; it is counted and retried next time.
      pruneFailed++;
    }
  }
  return { pruned, pruneFailed };
}

async function listKeys(storage: SnapshotStorage): Promise<readonly string[] | null> {
  try {
    return await storage.getAllKeys();
  } catch {
    return null;
  }
}

/**
 * Writes `dayform.snapshot.<today>` when one is due, then prunes old ones. Never throws, never reads or
 * writes the main task key, and never snapshots an empty list (it could replace a good one with nothing) unless the
 * tracker holds data.
 * `cycle` (the private period tracker, health data) is part of the snapshot only when it holds data; it stays on
 * the device like the tasks. The size cap applies to the whole text, tracker data included.
 */
export async function takeSnapshot(
  storage: SnapshotStorage,
  tasks: readonly Task[],
  now: Date,
  categories?: CategoriesState,
  cycle?: CycleState,
  specialDays?: SpecialDaysState,
): Promise<SnapshotResult> {
  if (Number.isNaN(now.getTime())) return { kind: "failed", reason: "invalid-date" };
  // An empty list is not worth a snapshot (it could replace a good one with nothing), unless the tracker has data.
  const hasSpecialDays = specialDays !== undefined && specialDays.items.length > 0;
  if (tasks.length === 0 && !(cycle !== undefined && hasCycleData(cycle)) && !hasSpecialDays) return { kind: "skipped", reason: "empty" };
  const keys = await listKeys(storage);
  if (keys === null) return { kind: "failed", reason: "list-failed" };
  const today = dateKey(now);
  if (!shouldSnapshot(keys, today)) return { kind: "skipped", reason: "not-due" };

  if (tasks.length * MIN_TASK_JSON_BYTES > MAX_SNAPSHOT_BYTES) return { kind: "skipped", reason: "too-large" };
  const text = serializeBackup(tasks, now, { compact: true, categories, specialDays, cycle });
  if (utf8Length(text) > MAX_SNAPSHOT_BYTES) return { kind: "skipped", reason: "too-large" };
  const key = snapshotKey(today);
  try {
    await storage.setItem(key, text);
  } catch {
    return { kind: "failed", reason: "write-failed" };
  }
  return { kind: "written", key, ...(await pruneSnapshots(storage, [...keys, key], today)) };
}

/** `categories` (when customised) is stored in the snapshot too, so a restore brings back custom category names. */
export type SnapshotInput = {
  tasks: readonly Task[];
  canSnapshot: boolean;
  categories?: CategoriesState;
  /** Left out until the special days were read (the empty list must never stand in for them). */
  specialDays?: SpecialDaysState;
  /** Left out until the tracker was read safely (the defaults must never stand in for it). */
  cycle?: CycleState;
};
export type SnapshotRunner = {
  /** `null` when nothing was attempted (not trustworthy, already running, or disposed). */
  run(): Promise<SnapshotResult | null>;
  dispose(): void;
};

/** Single-flight wrapper that always snapshots the freshest tasks and only while they are trustworthy. */
export function createSnapshotRunner(options: {
  storage: SnapshotStorage;
  read: () => SnapshotInput;
  now: () => Date;
  /** Called with every attempted result (never for a run that did not start). */
  onResult?: (result: SnapshotResult) => void;
}): SnapshotRunner {
  let running = false;
  let disposed = false;
  return {
    async run() {
      if (disposed || running) return null;
      const input = options.read();
      if (!input.canSnapshot) return null;
      running = true;
      try {
        const result = await takeSnapshot(options.storage, input.tasks, options.now(), input.categories, input.cycle, input.specialDays);
        options.onResult?.(result);
        return result;
      } finally {
        running = false;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
