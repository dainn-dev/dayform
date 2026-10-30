import { hasCategoryCustomizations, parseCategoriesState, type CategoriesState } from "./categories";
import { hasCycleData, parseCycleState, type CycleState } from "./cycle";
import { parseJson } from "./json";
import { Task, dateKey } from "./planner";
import { parseSpecialDaysState, type SpecialDaysState } from "./special-days";
import { MAX_RECORDS, taskSchema } from "./task-storage";

export const BACKUP_FORMAT = "dayform-backup";
export const BACKUP_VERSION = 1;

export type BackupFailure = "invalid-json" | "wrong-format" | "unsupported-version" | "too-large";
export type ParseResult =
  /**
   * `categories` / `specialDays` / `cycle` are present only when the file carried such an object (validated and capped like stored
   * data). `cycle` is the private period tracker (health data) and is read inside the same size cap as the tasks.
   */
  | { ok: true; tasks: Task[]; rejected: number; categories?: CategoriesState; specialDays?: SpecialDaysState; cycle?: CycleState }
  | { ok: false; reason: BackupFailure };
export type MergeMode = "merge" | "replace";
export type MergeResult = { tasks: Task[]; added: number; updated: number; unchanged: number };

/** Largest backup file (bytes, and later characters) that is read and parsed at all. */
export const MAX_BACKUP_BYTES = 2_000_000;

/** Every stored field is compared, so a field added to the schema can never be silently ignored. */
const COMPARED_KEYS = Object.keys(taskSchema.shape) as (keyof Task)[];

export type SerializeOptions = {
  /** No indentation: about a third smaller, for copies that only the app itself reads back. */
  compact?: boolean;
  /** Written as `categories` only when it holds custom categories, hidden built-ins or renames. */
  categories?: CategoriesState;
  /** Written as `specialDays` only when the user keeps at least one special day. */
  specialDays?: SpecialDaysState;
  /** Written as `cycle` only when the tracker is on or holds a period (`hasCycleData`); marks the file as health data. */
  cycle?: CycleState;
};

/** English note written into a file that carries tracker data; ignored when the file is read back. */
export const HEALTH_DATA_NOTICE = "Contains health data (period tracker). Not encrypted: share it only with people you trust.";

/** JSON envelope (pretty by default). `exportedAt` is an ISO instant (informational only, never a task date). */
export function serializeBackup(tasks: readonly Task[], now: Date, options: SerializeOptions = {}): string {
  const { categories, specialDays, cycle } = options;
  const envelope = {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), tasks,
    ...(categories !== undefined && hasCategoryCustomizations(categories) ? { categories } : {}),
    ...(specialDays !== undefined && specialDays.items.length > 0 ? { specialDays } : {}),
    ...(cycle !== undefined && hasCycleData(cycle)
      ? { containsHealthData: true, notice: HEALTH_DATA_NOTICE, cycle }
      : {}),
  };
  return options.compact === true ? JSON.stringify(envelope) : JSON.stringify(envelope, null, 2);
}

export function backupFileName(now: Date): string {
  return `dayform-backup-${dateKey(now)}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Extracted =
  | { ok: true; records: unknown[]; categories?: CategoriesState; specialDays?: SpecialDaysState; cycle?: CycleState }
  | { ok: false; reason: BackupFailure };

function extractRecords(value: unknown): Extracted {
  if (Array.isArray(value)) return { ok: true, records: value };
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) return { ok: false, reason: "wrong-format" };
  const { version, tasks } = value;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: "wrong-format" };
  }
  if (version > BACKUP_VERSION) return { ok: false, reason: "unsupported-version" };
  if (!Array.isArray(tasks)) return { ok: false, reason: "wrong-format" };
  return {
    ok: true,
    records: tasks,
    ...(isRecord(value.categories) ? { categories: parseCategoriesState(value.categories) } : {}),
    ...(isRecord(value.specialDays) ? { specialDays: parseSpecialDaysState(value.specialDays).state } : {}),
    ...(isRecord(value.cycle) ? { cycle: parseCycleState(value.cycle) } : {}),
  };
}

function validateRecords(records: readonly unknown[]): { tasks: Task[]; rejected: number } {
  const seen = new Set<string>();
  const tasks: Task[] = [];
  for (const record of records) {
    const parsed = taskSchema.safeParse(record);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    tasks.push(parsed.data);
  }
  return { tasks, rejected: records.length - tasks.length };
}

/** Accepts the backup envelope or a bare task array. Never throws. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, reason: "too-large" };
  const json = parseJson(text);
  if (!json.ok) return { ok: false, reason: "invalid-json" };
  const extracted = extractRecords(json.value);
  if (!extracted.ok) return extracted;
  if (extracted.records.length > MAX_RECORDS) return { ok: false, reason: "too-large" };
  return {
    ok: true as const,
    ...validateRecords(extracted.records),
    ...(extracted.categories === undefined ? {} : { categories: extracted.categories }),
    ...(extracted.specialDays === undefined ? {} : { specialDays: extracted.specialDays }),
    ...(extracted.cycle === undefined ? {} : { cycle: extracted.cycle }),
  };
}

function sameTask(a: Task, b: Task): boolean {
  return COMPARED_KEYS.every(key => (a[key] ?? null) === (b[key] ?? null));
}

function firstById(tasks: readonly Task[]): Map<string, Task> {
  const byId = new Map<string, Task>();
  for (const item of tasks) if (!byId.has(item.id)) byId.set(item.id, item);
  return byId;
}

/** `replace` yields the incoming tasks only; `merge` keeps the current order and appends new ones. */
export function mergeBackup(
  current: readonly Task[],
  incoming: readonly Task[],
  mode: MergeMode,
): MergeResult {
  const currentById = firstById(current);
  const incomingById = firstById(incoming);
  let added = 0, updated = 0, unchanged = 0;
  for (const item of incomingById.values()) {
    const existing = currentById.get(item.id);
    if (!existing) added++;
    else if (sameTask(existing, item)) unchanged++;
    else updated++;
  }
  const incomingList = [...incomingById.values()];
  if (mode === "replace") return { tasks: incomingList, added, updated, unchanged };
  const kept = current.map(item => incomingById.get(item.id) ?? item);
  const fresh = incomingList.filter(item => !currentById.has(item.id));
  return { tasks: [...kept, ...fresh], added, updated, unchanged };
}
