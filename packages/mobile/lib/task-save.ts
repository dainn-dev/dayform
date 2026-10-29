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
  /** Inclusive last day of the repeat ('YYYY-MM-DD'); null/omitted = never ends. Ignored without `repeat`. */
  repeatUntil?: string | null;
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

export type SavePlan = { ok: true; candidate: Task; update: (tasks: Task[]) => Task[] };

/**
 * A save the editor must not perform. "rule-change-needs-scope": changing the repeat rule of a
 * series occurrence only for itself would start a second series while the old one keeps extending.
 */
export type SaveRefusal = { ok: false; reason: "rule-change-needs-scope" };

export type SaveResult = SavePlan | SaveRefusal;

/** Shown (translated) when a save is refused for `rule-change-needs-scope`. */
export const RULE_CHANGE_MESSAGE = "To change the repeat rule, keep the task on its original date.";

export type DeletePlan = { kind: "remove"; id: string } | { kind: "mutate"; update: (tasks: Task[]) => Task[] };

type Update = (tasks: Task[]) => Task[];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_DURATION = 1;
const MAX_DURATION = 1440;

export const END_BEFORE_DATE_MESSAGE = "The end date must be on or after the task date.";

type FormText = {
  title: string; duration: string; scheduled: boolean; date: string; time: string;
  repeat?: Repeat | null; repeatUntil?: string | null;
};

function isDateKey(value: string): boolean {
  return DATE_PATTERN.test(value) && dateKey(fromKey(value)) === value;
}

function validateEndDate(input: FormText): string | null {
  const { repeat, repeatUntil } = input;
  if (repeat == null || repeatUntil == null) return null;
  if (!isDateKey(repeatUntil)) return "Use a valid date: YYYY-MM-DD.";
  return repeatUntil < input.date ? END_BEFORE_DATE_MESSAGE : null;
}

/** Raw text fields of the form, as typed. Returns an English message (a translation key) or null. */
export function validateForm(input: FormText): string | null {
  if (!input.title.trim()) return "Give this task a title.";
  const n = Number(input.duration);
  if (!Number.isInteger(n) || n < MIN_DURATION || n > MAX_DURATION) return "Duration must be 1–1440 minutes.";
  if (!input.scheduled) return null;
  if (!isDateKey(input.date)) return "Use a valid date: YYYY-MM-DD.";
  if (!TIME_PATTERN.test(input.time)) return "Use a 24-hour time: HH:mm.";
  if (minutes(input.time) + n > MAX_DURATION) return "Scheduled tasks must end before midnight.";
  return validateEndDate(input);
}

export function hasConflict(candidate: Task, tasks: readonly Task[]): boolean {
  return tasks.some(other => overlaps(candidate, other));
}

/** True when the user must choose a scope: a series occurrence whose date is unchanged and stays scheduled. */
export function needsScopeChoice(existing: Task | null, form: SaveForm): boolean {
  return existing?.seriesId != null && form.scheduled && form.date === existing.date;
}

const ALL_SCOPES: readonly EditScope[] = ["this", "following", "all"];

/** A rule change: another rule, or (for a repeating task) another end date. */
function ruleChanged(original: Task, repeat: Repeat | null, until: string | null): boolean {
  return repeat !== (original.repeat ?? null) || until !== (original.repeatUntil ?? null);
}

/** The end date a form really asks for: none without a rule or for a backlog task. */
function effectiveUntil(form: { repeat: Repeat | null; repeatUntil?: string | null }, scheduled = true): string | null {
  return scheduled && form.repeat !== null ? form.repeatUntil ?? null : null;
}

/**
 * Scopes an edit of `original` may use. A task outside a series only has "this"; when the repeat
 * rule or its end date changed, "this task only" is not allowed (the change applies from this
 * occurrence onwards). An omitted `repeatUntil` means the end date is unchanged.
 */
export function allowedScopes(original: Task, form: { repeat: Repeat | null; repeatUntil?: string | null }): EditScope[] {
  if (original.seriesId == null) return ["this"];
  const until = form.repeatUntil === undefined ? original.repeatUntil ?? null : effectiveUntil(form);
  return ALL_SCOPES.filter(scope => scope !== "this" || !ruleChanged(original, form.repeat, until));
}

function buildCandidate(form: SaveForm, ctx: SaveContext): Task {
  const { existing } = ctx;
  const scheduled = form.scheduled;
  const until = effectiveUntil(form, scheduled);
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
    ...(until === null ? {} : { repeatUntil: until }),
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

function editSeriesMember(candidate: Task, repeat: Repeat | null, scope: EditScope, ctx: SaveContext, existing: Task): Update {
  const until = candidate.repeatUntil ?? null;
  return tasks => {
    const stored = tasks.find(t => t.id === existing.id);
    if (!stored) return upsert(tasks, { ...candidate, seriesId: null, repeat: null, repeatUntil: null });
    const edited = scopedEdit(tasks, stored, patchOf(candidate), scope);
    const changes = candidate.date !== null && ruleChanged(stored, repeat, until);
    return changes ? changeRule(edited, stored, repeat, ctx.today, ctx.newSeriesId, undefined, until) : edited;
  };
}

function editPlain(candidate: Task, repeat: Repeat | null, ctx: SaveContext): Update {
  return tasks => {
    const saved = upsert(tasks, candidate);
    return repeat === null ? saved : changeRule(saved, candidate, repeat, ctx.today, ctx.newSeriesId, undefined, candidate.repeatUntil ?? null);
  };
}

function addNew(candidate: Task, repeat: Repeat | null, ctx: SaveContext): Update {
  return tasks => repeat === null
    ? [...tasks, candidate]
    : [...tasks, ...createSeries(candidate, repeat, ctx.today, ctx.newSeriesId)];
}

/** The scope an edit really uses: moving the occurrence to another date (or off the calendar) is always "this". */
function effectiveScope(candidate: Task, existing: Task, requested: EditScope): EditScope {
  return candidate.date === null || candidate.date !== existing.date ? "this" : requested;
}

/**
 * Plans a save from the editor form, or refuses it (see `SaveRefusal`). A backlog task can
 * neither remind nor repeat, so those form values are dropped when `scheduled` is false.
 */
export function planSave(form: SaveForm, ctx: SaveContext): SaveResult {
  const candidate = buildCandidate(form, ctx);
  const repeat = form.scheduled ? form.repeat : null;
  const { existing } = ctx;
  if (!existing) return { ok: true, candidate, update: addNew(candidate, repeat, ctx) };
  if (existing.seriesId == null) return { ok: true, candidate, update: editPlain(candidate, repeat, ctx) };
  const scope = effectiveScope(candidate, existing, ctx.scope);
  if (scope === "this" && candidate.date !== null && ruleChanged(existing, repeat, candidate.repeatUntil ?? null)) return { ok: false, reason: "rule-change-needs-scope" };
  return { ok: true, candidate, update: editSeriesMember(candidate, repeat, scope, ctx, existing) };
}

/**
 * Plans a deletion. A plain task goes through `store.remove` (so the undo bar can restore it).
 * A series member goes through `mutate`. Deleting just "this" occurrence removes only it, even
 * the last one (a known quirk: `extendSeries` may regenerate a deleted LAST occurrence);
 * "following" ends the series (earlier occurrences are detached).
 */
export function planDelete(existing: Task, scope: EditScope): DeletePlan {
  if (existing.seriesId == null) return { kind: "remove", id: existing.id };
  return {
    kind: "mutate",
    update: tasks => removeScope(tasks, tasks.find(t => t.id === existing.id) ?? existing, scope),
  };
}
