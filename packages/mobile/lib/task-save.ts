import { dateKey, fromKey, minutes, overlaps, type Category, type Repeat, type Status, type Task } from "./planner";
import { applyEdit, changeRule, createSeries, removeScope, type EditScope } from "./recurrence";

/**
 * Pure planning of what the task editor writes. Everything returns an `update` function for
 * `store.mutate`, so a recurring edit (several tasks at once) commits atomically.
 * Inputs are never mutated. Framework-free.
 */

export type SaveForm = {
  title: string;
  duration: number;
  scheduled: boolean;
  date: string;
  time: string;
  category: Category;
  status: Status;
  notes: string;
  remind: number | null;
  repeat: Repeat | null;
};

export type SaveContext = {
  /** The task being edited, or null for a new one. */
  existing: Task | null;
  /** Which occurrences an edit of a series member applies to. Ignored for other tasks. */
  scope: EditScope;
  today: string;
  newId: () => string;
  newSeriesId: () => string;
  nowIso: string;
};

export type SavePlan = { candidate: Task; update: (tasks: Task[]) => Task[] };

export type DeletePlan = { kind: "remove"; id: string } | { kind: "mutate"; update: (tasks: Task[]) => Task[] };

type Update = (tasks: Task[]) => Task[];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_DURATION = 1;
const MAX_DURATION = 1440;

/** Raw text fields of the form, as typed. Returns an English message (a translation key) or null. */
export function validateForm(input: { title: string; duration: string; scheduled: boolean; date: string; time: string }): string | null {
  if (!input.title.trim()) return "Give this task a title.";
  const n = Number(input.duration);
  if (!Number.isInteger(n) || n < MIN_DURATION || n > MAX_DURATION) return "Duration must be 1–1440 minutes.";
  if (!input.scheduled) return null;
  if (!DATE_PATTERN.test(input.date) || dateKey(fromKey(input.date)) !== input.date) return "Use a valid date: YYYY-MM-DD.";
  if (!TIME_PATTERN.test(input.time)) return "Use a 24-hour time: HH:mm.";
  if (minutes(input.time) + n > MAX_DURATION) return "Scheduled tasks must end before midnight.";
  return null;
}

export function hasConflict(candidate: Task, tasks: readonly Task[]): boolean {
  return tasks.some(other => overlaps(candidate, other));
}

/** True when the user must choose a scope: a series occurrence whose date is unchanged and stays scheduled. */
export function needsScopeChoice(existing: Task | null, form: SaveForm): boolean {
  return existing?.seriesId != null && form.scheduled && form.date === existing.date;
}

function buildCandidate(form: SaveForm, ctx: SaveContext): Task {
  const { existing } = ctx;
  const scheduled = form.scheduled;
  return {
    id: existing?.id ?? ctx.newId(),
    title: form.title.trim(),
    date: scheduled ? form.date : null,
    start: scheduled ? form.time : null,
    duration: form.duration,
    status: form.status,
    category: form.category,
    notes: form.notes.trim(),
    createdAt: existing?.createdAt ?? ctx.nowIso,
    remind: scheduled ? form.remind : null,
    seriesId: scheduled ? existing?.seriesId ?? null : null,
    repeat: scheduled ? existing?.repeat ?? null : null,
  };
}

function upsert(tasks: Task[], task: Task): Task[] {
  return tasks.some(t => t.id === task.id) ? tasks.map(t => (t.id === task.id ? task : t)) : [...tasks, task];
}

function patchOf(candidate: Task): Partial<Task> {
  const { title, date, start, duration, status, category, notes, remind } = candidate;
  return { title, date, start, duration, status, category, notes, remind };
}

/** Scoped edit; the status is per occurrence, so it is always applied to this occurrence too. */
function scopedEdit(tasks: Task[], stored: Task, patch: Partial<Task>, scope: EditScope): Task[] {
  const edited = applyEdit(tasks, stored, patch, scope);
  return scope === "this" ? edited : applyEdit(edited, stored, { status: patch.status }, "this");
}

function editSeriesMember(candidate: Task, repeat: Repeat | null, ctx: SaveContext, existing: Task): Update {
  return tasks => {
    const stored = tasks.find(t => t.id === existing.id);
    if (!stored) return upsert(tasks, { ...candidate, seriesId: null, repeat: null });
    const patch = patchOf(candidate);
    const scope: EditScope = candidate.date === null || candidate.date !== stored.date ? "this" : ctx.scope;
    const ruleChanged = candidate.date !== null && repeat !== (stored.repeat ?? null);
    if (!ruleChanged) return scopedEdit(tasks, stored, patch, scope);
    if (scope === "this") {
      const detached = tasks.map(t => (t.id === stored.id ? { ...t, ...patch, id: t.id, seriesId: null, repeat: null } : t));
      return repeat === null ? detached : changeRule(detached, stored, repeat, ctx.today, ctx.newSeriesId);
    }
    return changeRule(scopedEdit(tasks, stored, patch, scope), stored, repeat, ctx.today, ctx.newSeriesId);
  };
}

function editPlain(candidate: Task, repeat: Repeat | null, ctx: SaveContext): Update {
  return tasks => {
    const saved = upsert(tasks, candidate);
    return repeat === null ? saved : changeRule(saved, candidate, repeat, ctx.today, ctx.newSeriesId);
  };
}

function addNew(candidate: Task, repeat: Repeat | null, ctx: SaveContext): Update {
  return tasks => repeat === null
    ? [...tasks, candidate]
    : [...tasks, ...createSeries(candidate, repeat, ctx.today, ctx.newSeriesId)];
}

/**
 * Plans a save from the editor form. A backlog task can neither remind nor repeat, so those
 * form values are dropped when `scheduled` is false (schema invariants).
 */
export function planSave(form: SaveForm, ctx: SaveContext): SavePlan {
  const candidate = buildCandidate(form, ctx);
  const repeat = form.scheduled ? form.repeat : null;
  const { existing } = ctx;
  if (!existing) return { candidate, update: addNew(candidate, repeat, ctx) };
  if (existing.seriesId != null) return { candidate, update: editSeriesMember(candidate, repeat, ctx, existing) };
  return { candidate, update: editPlain(candidate, repeat, ctx) };
}

function isLastOccurrence(tasks: readonly Task[], stored: Task): boolean {
  const { date } = stored;
  if (date === null) return true;
  return !tasks.some(t => t.seriesId === stored.seriesId && t.date !== null && t.date > date);
}

/**
 * Plans a deletion. A plain task goes through `store.remove` (so the undo bar can restore it).
 * A series member goes through `mutate`; deleting the LAST occurrence of a series ends it
 * (everything left is detached), otherwise `extendSeries` would regenerate it.
 */
export function planDelete(existing: Task, scope: EditScope, today: string, newSeriesId: () => string): DeletePlan {
  if (existing.seriesId == null) return { kind: "remove", id: existing.id };
  return {
    kind: "mutate",
    update: tasks => {
      const stored = tasks.find(t => t.id === existing.id) ?? existing;
      if (scope === "this" && isLastOccurrence(tasks, stored)) {
        return changeRule(tasks, stored, null, today, newSeriesId).filter(t => t.id !== stored.id);
      }
      return removeScope(tasks, stored, scope);
    },
  };
}
