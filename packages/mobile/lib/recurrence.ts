import { addDays, dateKey, fromKey, type Repeat, type Task } from "./planner";

/**
 * Recurring tasks are "materialised": each occurrence is a flat Task sharing a `seriesId`,
 * carrying `repeat`, with the deterministic id `${seriesId}:${date}` and an independent status.
 * A rolling horizon is generated up front and topped up with `extendSeries`.
 * All functions are pure; inputs are never mutated.
 */

/**
 * Per-series cap on FUTURE occurrences, i.e. rows dated today or later. Past rows are never
 * counted (they are history and are not pruned), so a long-running series keeps being extended.
 */
export const MAX_OCCURRENCES_PER_SERIES = 120;
export const DEFAULT_HORIZON_WEEKS = 8;

export type EditScope = "this" | "following" | "all";

const DAYS_PER_WEEK = 7;
const SATURDAY = 6;
const SUNDAY = 0;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTENT_FIELDS = ["title", "start", "duration", "category", "notes", "remind"] as const;

type SeriesMember = Task & { seriesId: string; repeat: Repeat; date: string };

function assertNever(value: never): never {
  throw new Error(`Unhandled repeat rule: ${String(value)}`);
}

function assertDateKey(value: string): void {
  if (!DATE_PATTERN.test(value) || dateKey(fromKey(value)) !== value) {
    throw new Error(`Invalid date: ${value}`);
  }
}

function weekdayOf(key: string): number {
  return fromKey(key).getDay();
}

function isWeekend(key: string): boolean {
  const day = weekdayOf(key);
  return day === SATURDAY || day === SUNDAY;
}

/** How a rule walks the calendar: the step in days, and whether weekends are skipped. */
function ruleSpec(rule: Repeat): { step: number; weekdaysOnly: boolean } {
  switch (rule) {
    case "daily": return { step: 1, weekdaysOnly: false };
    case "weekdays": return { step: 1, weekdaysOnly: true };
    case "weekly": return { step: DAYS_PER_WEEK, weekdaysOnly: false };
    default: return assertNever(rule);
  }
}

/** Whether `rule`, anchored on `anchor`, fires on `day` (a day not before the anchor). */
function firesOn(rule: Repeat, anchor: string, day: string): boolean {
  const { step, weekdaysOnly } = ruleSpec(rule);
  if (weekdaysOnly && isWeekend(day)) return false;
  return step === 1 || weekdayOf(day) === weekdayOf(anchor);
}

/**
 * Dates on which `rule` fires from `startDate` to `toDate`, both inclusive (at most `limit`).
 * daily = every day; weekdays = Monday-Friday only (a weekend `startDate` is therefore NOT
 * included); weekly = the same weekday as `startDate`.
 */
export function occurrenceDates(rule: Repeat, startDate: string, toDate: string, limit = Infinity): string[] {
  assertDateKey(startDate);
  assertDateKey(toDate);
  const { step, weekdaysOnly } = ruleSpec(rule);
  const result: string[] = [];
  for (let day = startDate; day <= toDate && result.length < limit; day = addDays(day, step)) {
    if (weekdaysOnly && isWeekend(day)) continue;
    result.push(day);
  }
  return result;
}

function horizonEnd(today: string, horizonWeeks: number): string {
  return addDays(today, Math.max(0, horizonWeeks) * DAYS_PER_WEEK);
}

function occurrence(template: Task, seriesId: string, rule: Repeat, date: string): Task {
  return { ...template, id: `${seriesId}:${date}`, date, status: "todo", seriesId, repeat: rule };
}

function isSeriesMember(task: Task): task is SeriesMember {
  return Boolean(task.seriesId) && Boolean(task.repeat) && task.date !== null;
}

function countFuture(rows: readonly Task[], today: string): number {
  return rows.filter(row => row.date !== null && row.date >= today).length;
}

/**
 * Builds a series from `template`. The first occurrence is ALWAYS on `template.date` and keeps
 * the template status, even when the rule would not fire that day (e.g. "weekdays" on a Saturday);
 * later ones follow the rule up to today + `horizonWeeks` weeks (never before the template date).
 * At most MAX_OCCURRENCES_PER_SERIES occurrences are dated today or later. A template far in the
 * past is backfilled with only the most recent MAX_OCCURRENCES_PER_SERIES - 1 rule dates before
 * today (older ones are skipped), so a series never starts with a runaway amount of history.
 */
export function createSeries(
  template: Task,
  rule: Repeat,
  today: string,
  newSeriesId: () => string,
  horizonWeeks = DEFAULT_HORIZON_WEEKS,
): Task[] {
  if (template.date === null) throw new Error("createSeries needs a scheduled template: its date is null");
  const start = template.date;
  const seriesId = newSeriesId();
  const first: Task = { ...template, id: `${seriesId}:${start}`, seriesId, repeat: rule };
  const later = occurrenceDates(rule, start, horizonEnd(today, horizonWeeks)).filter(day => day > start);
  const futureRoom = MAX_OCCURRENCES_PER_SERIES - countFuture([first], today);
  const past = later.filter(day => day < today).slice(-(MAX_OCCURRENCES_PER_SERIES - 1));
  const future = later.filter(day => day >= today).slice(0, futureRoom);
  return [first, ...[...past, ...future].map(day => occurrence(template, seriesId, rule, day))];
}

function latestOf(rows: readonly SeriesMember[]): SeriesMember {
  return rows.reduce((best, row) => (row.date >= best.date ? row : best));
}

/** The weekday most of `rows` fall on (ties go to the weekday that occurs first by date). */
function dominantWeekday(rows: readonly SeriesMember[]): number {
  const counts = new Map<number, number>();
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const day = weekdayOf(row.date);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

/** First day on or after `from` that falls on `weekday`. */
function alignToWeekday(from: string, weekday: number): string {
  return addDays(from, (weekday - weekdayOf(from) + DAYS_PER_WEEK) % DAYS_PER_WEEK);
}

/**
 * Extends one series. Its rule is the one of its latest occurrence. The template is the most
 * recent occurrence of that rule whose date matches it (the latest one if none does); for weekly,
 * the weekday is the one most occurrences share, so a dragged occurrence cannot re-anchor the
 * series. New dates are strictly after the latest occurrence and never before `today`.
 */
function extensionFor(members: readonly SeriesMember[], today: string, end: string, taken: ReadonlySet<string>): Task[] {
  const latest = latestOf(members);
  const rule = latest.repeat;
  const sameRule = members.filter(member => member.repeat === rule);
  const weekday = dominantWeekday(sameRule);
  const matching = sameRule.filter(member => firesOn(rule, alignToWeekday(member.date, weekday), member.date));
  const template = matching.length > 0 ? latestOf(matching) : latest;
  const dayAfter = addDays(latest.date, 1);
  const earliest = dayAfter > today ? dayAfter : today;
  const from = rule === "weekly" ? alignToWeekday(earliest, weekday) : earliest;
  const room = Math.max(0, MAX_OCCURRENCES_PER_SERIES - countFuture(members, today));
  return occurrenceDates(rule, from, end, room)
    .map(day => occurrence(template, latest.seriesId, rule, day))
    .filter(next => !taken.has(next.id));
}

/**
 * Tops every series up to the horizon. Only dates strictly after the series' latest occurrence
 * and never before `today` are generated, so a gap the user deleted stays deleted, a long absence
 * does not backfill past days, and the call is idempotent. At most MAX_OCCURRENCES_PER_SERIES
 * occurrences dated today or later exist per series (past rows are not counted). Known
 * limitation: deleting the LAST occurrence of a series lets it be regenerated by the next call.
 * A date whose id is already taken (e.g. by an occurrence moved to another date) is skipped.
 */
export function extendSeries(tasks: Task[], today: string, horizonWeeks = DEFAULT_HORIZON_WEEKS): Task[] {
  const end = horizonEnd(today, horizonWeeks);
  const bySeries = new Map<string, SeriesMember[]>();
  for (const task of tasks) {
    if (isSeriesMember(task)) bySeries.set(task.seriesId, [...(bySeries.get(task.seriesId) ?? []), task]);
  }
  const taken = new Set(tasks.map(task => task.id));
  const added = [...bySeries.values()].flatMap(members => extensionFor(members, today, end, taken));
  return [...tasks, ...added];
}

/** Stored occurrences affected by `scope`. A non-series task is always just itself. */
export function scopeTargets(tasks: Task[], task: Task, scope: EditScope): Task[] {
  const seriesId = task.seriesId;
  if (!seriesId || scope === "this" || task.date === null) return tasks.filter(t => t.id === task.id);
  const sameSeries = tasks.filter(t => t.seriesId === seriesId);
  if (scope === "all") return sameSeries;
  const from = task.date;
  return sameSeries.filter(t => t.date !== null && t.date >= from);
}

function definedEntries(patch: Partial<Task>): Partial<Task> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<Task>;
}

function contentOf(patch: Partial<Task>): Partial<Task> {
  const defined = definedEntries(patch);
  return Object.fromEntries(CONTENT_FIELDS.filter(key => key in defined).map(key => [key, defined[key]])) as Partial<Task>;
}

/** Keeps the store invariants: backlog tasks have no series, unscheduled tasks have no reminder. */
function normalize(task: Task): Task {
  let next = task;
  if (next.date === null && (next.seriesId != null || next.repeat != null)) next = { ...next, seriesId: null, repeat: null };
  if (next.start === null && next.remind != null) next = { ...next, remind: null };
  return next;
}

/**
 * "this" applies the whole patch (date/start/status included, but never the id) to one task.
 * "following"/"all" apply only title, start, duration, category, notes and remind. A task that
 * is not part of a series is edited as "this". Moving a task to the backlog detaches it.
 */
export function applyEdit(tasks: Task[], task: Task, patch: Partial<Task>, scope: EditScope): Task[] {
  const effective: EditScope = task.seriesId ? scope : "this";
  const ids = new Set(scopeTargets(tasks, task, effective).map(t => t.id));
  const change = effective === "this" ? definedEntries(patch) : contentOf(patch);
  return tasks.map(t => (ids.has(t.id) ? normalize({ ...t, ...change, id: t.id }) : t));
}

function detach(task: Task): Task {
  return { ...task, seriesId: null, repeat: null };
}

/**
 * Removes the targets. Deleting "following" ends the series, so the earlier occurrences that
 * remain are detached into plain tasks; otherwise extendSeries would regenerate what was deleted.
 */
export function removeScope(tasks: Task[], task: Task, scope: EditScope): Task[] {
  const effective: EditScope = task.seriesId ? scope : "this";
  const ids = new Set(scopeTargets(tasks, task, effective).map(t => t.id));
  const remaining = tasks.filter(t => !ids.has(t.id));
  if (effective !== "following") return remaining;
  return remaining.map(t => (t.seriesId === task.seriesId ? detach(t) : t));
}

function endSeries(tasks: Task[], current: Task): Task[] {
  const seriesId = current.seriesId;
  if (!seriesId && current.repeat == null) return [...tasks];
  const kept = tasks.filter(t => !(seriesId && t.seriesId === seriesId && t.date !== null && current.date !== null && t.date > current.date));
  return kept.map(t => (t.id === current.id || (seriesId && t.seriesId === seriesId) ? detach(t) : t));
}

/**
 * Changes the repeat rule from `task` onwards. With a rule, `task` keeps its id/status/content and
 * the series continues under the same seriesId (a new one for a plain task); earlier occurrences
 * keep their old rule. Later occurrences whose dates still fall on the new rule are kept as they
 * are (status and edits included; only `repeat` is updated), the ones it no longer fires on are
 * deleted, and only the missing dates from today on are added as `todo` (never more than
 * MAX_OCCURRENCES_PER_SERIES dated today or later). With `null`, later occurrences are removed and
 * `task` and the earlier ones become plain tasks (otherwise extendSeries would regenerate them).
 */
export function changeRule(
  tasks: Task[],
  task: Task,
  newRule: Repeat | null,
  today: string,
  newSeriesId: () => string,
  horizonWeeks = DEFAULT_HORIZON_WEEKS,
): Task[] {
  const current = tasks.find(t => t.id === task.id);
  if (!current) return [...tasks];
  if (newRule === null) return endSeries(tasks, current);
  if (current.date === null) throw new Error("Only a scheduled task can repeat: its date is null");
  const anchor = current.date;
  const seriesId = current.seriesId ?? newSeriesId();
  const kept = tasks.flatMap((t): Task[] => {
    if (t.id === current.id) return [{ ...t, seriesId, repeat: newRule }];
    if (t.seriesId !== seriesId || t.date === null || t.date <= anchor) return [t];
    if (!firesOn(newRule, anchor, t.date)) return [];
    return [t.repeat === newRule ? t : { ...t, repeat: newRule }];
  });
  const head = kept.find(t => t.id === current.id) as Task;
  const members = kept.filter(t => t.seriesId === seriesId);
  const presentDates = new Set(members.map(t => t.date));
  const takenIds = new Set(kept.map(t => t.id));
  const room = Math.max(0, MAX_OCCURRENCES_PER_SERIES - countFuture(members, today));
  const generated = occurrenceDates(newRule, anchor, horizonEnd(today, horizonWeeks))
    .filter(day => day > anchor && day >= today && !presentDates.has(day))
    .map(day => occurrence(head, seriesId, newRule, day))
    .filter(next => !takenIds.has(next.id))
    .slice(0, room);
  return [...kept, ...generated];
}
