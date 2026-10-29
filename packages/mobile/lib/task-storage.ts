import { z } from "zod";
import { Task, categories, dateKey, fromKey, repeats, seedTasks } from "./planner";

export const TASKS_STORAGE_KEY = "dayform.tasks.v1";
export const CORRUPT_KEY_PREFIX = "dayform.tasks.corrupt.";
export const BACKUP_KEY_PREFIX = "dayform.tasks.backup.";
const MIN_DURATION = 1;
const MAX_DURATION = 1440;
export const MAX_RECORDS = 10_000;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type LoadResult =
  | { kind: "seed"; tasks: Task[] }
  | { kind: "ok"; tasks: Task[]; quarantined: number }
  | { kind: "recovered"; tasks: []; backupKey: string }
  | { kind: "read-only"; tasks: Task[] }
  | { kind: "locked"; reason: "read-failed" | "backup-failed" };

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => dateKey(fromKey(value)) === value);
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  date: dateString.nullable(),
  start: timeString.nullable(),
  duration: z.number().int().min(MIN_DURATION).max(MAX_DURATION),
  status: z.enum(["todo", "in_progress", "done"]),
  category: z.enum(categories),
  notes: z.string(),
  createdAt: z.string(),
  remind: z.number().int().min(0).max(MAX_DURATION).nullable().optional(),
  seriesId: z.string().min(1).nullable().optional(),
  repeat: z.enum(repeats).nullable().optional(),
})
  .refine(task => (task.date === null) === (task.start === null))
  .refine(task => task.remind == null || task.start !== null)
  .refine(task => (task.seriesId == null && task.repeat == null) || task.date !== null);

type Split = { valid: Task[]; rejected: unknown[] };

function splitRecords(records: unknown[]): Split {
  const seen = new Set<string>();
  const valid: Task[] = [];
  const rejected: unknown[] = [];
  for (const record of records) {
    const parsed = taskSchema.safeParse(record);
    if (!parsed.success || seen.has(parsed.data.id)) {
      rejected.push(record);
      continue;
    }
    seen.add(parsed.data.id);
    valid.push(parsed.data);
  }
  return { valid, rejected };
}

function fnv1a32(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), FNV_PRIME) >>> 0;
  }
  return hash;
}

/** Content-addressed key: identical text always maps to the same key, so re-copying is idempotent. */
export function contentKey(prefix: string, text: string): string {
  return `${prefix}${fnv1a32(text).toString(16)}-${text.length}`;
}

async function copyTo(storage: KeyValueStorage, key: string, value: string): Promise<boolean> {
  try {
    await storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

async function recover(storage: KeyValueStorage, raw: string): Promise<LoadResult> {
  const backupKey = contentKey(BACKUP_KEY_PREFIX, raw);
  return await copyTo(storage, backupKey, raw)
    ? { kind: "recovered", tasks: [], backupKey }
    : { kind: "locked", reason: "backup-failed" };
}

async function quarantine(storage: KeyValueStorage, split: Split): Promise<LoadResult> {
  const { valid, rejected } = split;
  if (rejected.length === 0) return { kind: "ok", tasks: valid, quarantined: 0 };
  const text = JSON.stringify(rejected);
  if (await copyTo(storage, contentKey(CORRUPT_KEY_PREFIX, text), text)) {
    return { kind: "ok", tasks: valid, quarantined: rejected.length };
  }
  return valid.length > 0 ? { kind: "read-only", tasks: valid } : { kind: "locked", reason: "backup-failed" };
}

/** Never writes `key`; only backup/quarantine copies are written, under content-addressed keys. */
export async function loadTasks(
  storage: KeyValueStorage,
  key: string = TASKS_STORAGE_KEY,
): Promise<LoadResult> {
  let raw: string | null;
  try {
    raw = await storage.getItem(key);
  } catch {
    return { kind: "locked", reason: "read-failed" };
  }
  if (raw === null) return { kind: "seed", tasks: seedTasks() };

  const parsed = parseJson(raw);
  if (!parsed.ok || !Array.isArray(parsed.value) || parsed.value.length > MAX_RECORDS) {
    return recover(storage, raw);
  }
  return quarantine(storage, splitRecords(parsed.value));
}
