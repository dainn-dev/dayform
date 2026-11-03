import { z } from "zod";
import { MAX_CHECKLIST_ITEMS, MAX_CHECKLIST_TEXT, minutes, type Category, type Task } from "./planner";

/**
 * Routines: a named set of timed tasks ("Morning", "Study evening") that one tap lays onto a day. Pure: no React and
 * no storage (lib/routines-store.ts keeps them). A routine remembers titles, start times, lengths, categories and the
 * wording of the steps, never dates, ticks or reminders, so applying it always gives fresh tasks.
 */
export const MAX_ROUTINES = 20;
export const MAX_ROUTINE_ITEMS = 20;
export const MAX_ROUTINE_NAME = 40;
const MAX_TITLE = 300;
const MINUTES_PER_DAY = 1440;
const MINUTES_PER_HOUR = 60;
const ID_PATTERN = /^r_[a-z0-9]{8}$/;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 8;

export type RoutineItem = {
  /** The user's own text: never translated. */
  title: string;
  /** `HH:mm`. */
  start: string;
  /** Minutes. */
  duration: number;
  category: Category;
  /** Wording of the checklist steps, all unticked when applied. */
  steps: string[];
};
export type Routine = { id: string; name: string; items: RoutineItem[] };
export type RoutinesState = { items: Routine[] };
export const DEFAULT_ROUTINES_STATE: RoutinesState = { items: [] };

export type RoutineFailure = "invalid-name" | "no-tasks" | "invalid-item" | "limit" | "unknown";
export type RoutineResult = { ok: true; state: RoutinesState; id?: string } | { ok: false; reason: RoutineFailure };

export function generateRoutineId(random: () => number = Math.random): string {
  let id = "r_";
  for (let i = 0; i < ID_LENGTH; i += 1) id += ID_ALPHABET[Math.min(ID_ALPHABET.length - 1, Math.floor(random() * ID_ALPHABET.length))];
  return id;
}

const itemSchema = z.object({
  title: z.string().min(1).max(MAX_TITLE),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().int().min(1).max(MINUTES_PER_DAY),
  category: z.string().min(1).max(40),
  steps: z.array(z.string().max(MAX_CHECKLIST_TEXT)).max(MAX_CHECKLIST_ITEMS).catch([]),
}).refine(item => minutes(item.start) + item.duration <= MINUTES_PER_DAY);

const routineSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  name: z.string().min(1).max(MAX_ROUTINE_NAME),
  items: z.array(itemSchema).min(1).max(MAX_ROUTINE_ITEMS),
});

export type ParsedRoutines = { state: RoutinesState; valid: boolean; lossy: boolean };

/** Reads stored text. `lossy` is true when a routine was dropped, so the caller keeps a copy before writing. */
export function parseRoutinesText(text: string): ParsedRoutines {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: DEFAULT_ROUTINES_STATE, valid: false, lossy: true };
  }
  const list = typeof raw === "object" && raw !== null && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : null;
  if (list === null) return { state: DEFAULT_ROUTINES_STATE, valid: false, lossy: true };
  const seen = new Set<string>();
  const items: Routine[] = [];
  for (const record of list.slice(0, MAX_ROUTINES)) {
    const parsed = routineSchema.safeParse(record);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    items.push(parsed.data);
  }
  return { state: { items }, valid: true, lossy: items.length !== list.length };
}

export function cleanRoutineName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_ROUTINE_NAME);
}

const byStart = (a: Task, b: Task): number => minutes(a.start ?? "00:00") - minutes(b.start ?? "00:00") || a.id.localeCompare(b.id);

/** The tasks a day could be saved as: scheduled ones, in time order, as many as a routine holds. */
export function savableTasks(tasks: readonly Task[], date: string): Task[] {
  return tasks.filter(task => task.date === date && task.start !== null).sort(byStart).slice(0, MAX_ROUTINE_ITEMS);
}

/** Saves the scheduled tasks of `date` as a new routine. */
export function addRoutineFromDay(
  state: RoutinesState, name: string, tasks: readonly Task[], date: string, id: string = generateRoutineId(), taskIds?: readonly string[],
): RoutineResult {
  const clean = cleanRoutineName(name);
  if (clean === "") return { ok: false, reason: "invalid-name" };
  // `taskIds` lets the user pick which tasks of the day go into the routine; omitted = all of them.
  const day = savableTasks(tasks, date).filter(task => taskIds === undefined || taskIds.includes(task.id));
  if (day.length === 0) return { ok: false, reason: "no-tasks" };
  if (state.items.length >= MAX_ROUTINES) return { ok: false, reason: "limit" };
  const items: RoutineItem[] = day.map(task => ({
    title: task.title,
    start: task.start as string,
    duration: task.duration,
    category: task.category,
    steps: (task.checklist ?? []).map(step => step.text),
  }));
  return { ok: true, state: { items: [...state.items, { id, name: clean, items }] }, id };
}

export function renameRoutine(state: RoutinesState, id: string, name: string): RoutineResult {
  const clean = cleanRoutineName(name);
  if (clean === "") return { ok: false, reason: "invalid-name" };
  if (!state.items.some(routine => routine.id === id)) return { ok: false, reason: "unknown" };
  return { ok: true, state: { items: state.items.map(routine => (routine.id === id ? { ...routine, name: clean } : routine)) } };
}

export type RoutineEdit = { name: string; items: readonly RoutineItem[] };

/** Replaces a routine's name and tasks (the user edited, removed or retimed some); the tasks are checked like stored ones and kept in time order. */
export function updateRoutine(state: RoutinesState, id: string, edit: RoutineEdit): RoutineResult {
  const clean = cleanRoutineName(edit.name);
  if (clean === "") return { ok: false, reason: "invalid-name" };
  if (!state.items.some(routine => routine.id === id)) return { ok: false, reason: "unknown" };
  if (edit.items.length === 0) return { ok: false, reason: "no-tasks" };
  const items: RoutineItem[] = [];
  for (const item of edit.items.slice(0, MAX_ROUTINE_ITEMS)) {
    const parsed = itemSchema.safeParse({ ...item, title: item.title.trim() });
    if (!parsed.success) return { ok: false, reason: "invalid-item" };
    items.push(parsed.data);
  }
  items.sort((a, b) => minutes(a.start) - minutes(b.start));
  return { ok: true, state: { items: state.items.map(routine => (routine.id === id ? { ...routine, name: clean, items } : routine)) } };
}

export function removeRoutine(state: RoutinesState, id: string): RoutineResult {
  if (!state.items.some(routine => routine.id === id)) return { ok: false, reason: "unknown" };
  return { ok: true, state: { items: state.items.filter(routine => routine.id !== id) } };
}

export type ApplyOptions = {
  date: string;
  /** Moves the whole routine so that its first task starts at this `HH:mm`; omitted = the saved times. */
  firstStart?: string;
  /** Reminder (minutes before) given to every task; null = none. */
  remind: number | null;
  newId: () => string;
  nowIso: string;
};

function clock(total: number): string {
  return `${String(Math.floor(total / MINUTES_PER_HOUR)).padStart(2, "0")}:${String(total % MINUTES_PER_HOUR).padStart(2, "0")}`;
}

/**
 * The tasks a routine lays onto `date`. A task that would start before midnight or at its end after moving the
 * routine is left out (the caller can compare lengths to tell the user), and one that would run past midnight is shortened.
 */
export function routineTasks(routine: Routine, options: ApplyOptions): Task[] {
  const first = routine.items.reduce((best, item) => Math.min(best, minutes(item.start)), MINUTES_PER_DAY);
  const shift = options.firstStart === undefined ? 0 : minutes(options.firstStart) - first;
  const tasks: Task[] = [];
  for (const item of routine.items) {
    const start = minutes(item.start) + shift;
    if (start < 0 || start >= MINUTES_PER_DAY) continue;
    tasks.push({
      id: options.newId(),
      title: item.title,
      date: options.date,
      start: clock(start),
      duration: Math.min(item.duration, MINUTES_PER_DAY - start),
      status: "todo",
      category: item.category,
      notes: "",
      createdAt: options.nowIso,
      remind: options.remind,
      seriesId: null,
      repeat: null,
      ...(item.steps.length === 0 ? {} : { checklist: item.steps.map(text => ({ text, done: false })) }),
    });
  }
  return tasks;
}

export type RoutinePlan = {
  /** What to add to the day. */
  tasks: Task[];
  /** Routine tasks left out because the day already has the same task (same title at the same time). */
  duplicates: number;
  /** Routine tasks left out because moving the routine pushed them past the day. */
  outside: number;
};

const sameText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What applying `routine` to `options.date` would add without doubling up: a task whose title and start time are
 * already on that day (`existing`) is skipped, so tapping the same routine twice adds nothing the second time.
 */
export function planRoutine(routine: Routine, options: ApplyOptions, existing: readonly Task[]): RoutinePlan {
  const all = routineTasks(routine, options);
  const onDay = existing.filter(task => task.date === options.date && task.start !== null);
  const tasks = all.filter(task => !onDay.some(other => other.start === task.start && sameText(other.title, task.title)));
  return { tasks, duplicates: all.length - tasks.length, outside: routine.items.length - all.length };
}
