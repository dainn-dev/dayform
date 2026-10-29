import { addDays, type Repeat, type Task } from "./planner";
import { DAYS_PER_WEEK, dayOfMonth, firesOn, occurrenceDates, weekdayOf, type Anchor } from "./recurrence-dates";

export { occurrenceDates };

/**
 * Recurring tasks are "materialised": each occurrence is a flat Task sharing a `seriesId`,
 * carrying `repeat` (and the optional end date `repeatUntil`, inclusive), with the deterministic id
 * `${seriesId}:${date}` and an independent status. A rolling horizon is generated up front and
 * topped up with `extendSeries`; nothing is ever generated after `repeatUntil`.
 * All functions are pure; inputs are never mutated.
 */

/**
 * Per-series cap on FUTURE occurrences, i.e. rows dated today or later. Past rows are never
 * counted (they are history and are not pruned), so a long-running series keeps being extended.
 */
export const MAX_OCCURRENCES_PER_SERIES = 120;
export const DEFAULT_HORIZON_WEEKS = 8;

export type EditScope = "this" | "following" | "all";

const CONTENT_FIELDS = ["title", "start", "duration", "category", "notes", "remind"] as const;

type SeriesMember = Task & { seriesId: string; repeat: Repeat; date: string };

function horizonEnd(today: string, horizonWeeks: number): string {
  return addDays(today, Math.max(0, horizonWeeks) * DAYS_PER_WEEK);
}

/** The earlier of `end` and the series end date (when there is one). */
function sooner(end: string, until: string | null | undefined): string {
  return until != null && until < end ? until : end;
}

/** `task` carrying end date `until`; the same object when it already does. */
function withUntil(task: Task, until: string | null): Task {
  return (task.repeatUntil ?? null) === until ? task : { ...task, repeatUntil: until };
}

/**
 * A task moved past its own end date would break the schema (end >= date), so its end date is
 * lifted to its date: that row is then the last one and the series does not run on.
 */
export function keepUntilValid(task: Task): Task {
  const { date, repeatUntil } = task;
  return date !== null && repeatUntil != null && date > repeatUntil ? { ...task, repeatUntil: date } : task;
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
 * later ones follow the rule up to today + `horizonWeeks` weeks (never before the template date)
 * and never after `template.repeatUntil` (inclusive); every occurrence carries it. Monthly
 * occurrences keep the day-of-month of `template.date`, clamped in shorter months.
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
  const end = sooner(horizonEnd(today, horizonWeeks), template.repeatUntil);
  const later = occurrenceDates(rule, start, end).filter(day => day > start);
  const futureRoom = MAX_OCCURRENCES_PER_SERIES - countFuture([first], today);
  const past = later.filter(day => day < today).slice(-(MAX_OCCURRENCES_PER_SERIES - 1));
  const future = later.filter(day => day >= today).slice(0, futureRoom);
  return [first, ...[...past, ...future].map(day => occurrence(template, seriesId, rule, day))];
}

function latestOf(rows: readonly SeriesMember[]): SeriesMember {
  return rows.reduce((best, row) => (row.date >= best.date ? row : best));
}

/** The most frequent value; ties go to the one seen first. */
function mostCommon(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

/** The weekday most of `rows` fall on (ties go to the weekday that occurs first by date). */
function dominantWeekday(rows: readonly SeriesMember[]): number {
  return mostCommon([...rows].sort((a, b) => a.date.localeCompare(b.date)).map(row => weekdayOf(row.date)));
}

/** The day-of-month most of `rows` fall on; ties go to the larger day (clamped days are always smaller). */
function dominantMonthDay(rows: readonly SeriesMember[]): number {
  return mostCommon(rows.map(row => dayOfMonth(row.date)).sort((a, b) => b - a));
}

/** First day on or after `from` that falls on `weekday`. */
function alignToWeekday(from: string, weekday: number): string {
  return addDays(from, (weekday - weekdayOf(from) + DAYS_PER_WEEK) % DAYS_PER_WEEK);
}

/**
 * Extends one series. Its rule is the one of its latest occurrence. The template is the most
 * recent occurrence of that rule whose date matches it (the latest one if none does); for weekly,
 * the weekday is the one most occurrences share, and for monthly the day-of-month, so a dragged
 * occurrence or a clamped one cannot re-anchor the series. New dates are strictly after the latest
 * occurrence, never before `today` and never after the latest occurrence's end date.
 */
function extensionFor(members: readonly SeriesMember[], today: string, end: string, taken: ReadonlySet<string>): Task[] {
  const latest = latestOf(members);
  const rule = latest.repeat;
  const sameRule = members.filter(member => member.repeat === rule);
  const anchor: Anchor = { weekday: dominantWeekday(sameRule), monthDay: dominantMonthDay(sameRule) };
  const matching = sameRule.filter(member => firesOn(rule, anchor, member.date));
  const template = withUntil(matching.length > 0 ? latestOf(matching) : latest, latest.repeatUntil ?? null);
  const dayAfter = addDays(latest.date, 1);
  const earliest = dayAfter > today ? dayAfter : today;
  const from = rule === "weekly" ? alignToWeekday(earliest, anchor.weekday) : earliest;
  const room = Math.max(0, MAX_OCCURRENCES_PER_SERIES - countFuture(members, today));
  return occurrenceDates(rule, from, sooner(end, latest.repeatUntil), room, anchor.monthDay)
    .map(day => occurrence(template, latest.seriesId, rule, day))
    .filter(next => !taken.has(next.id));
}

/**
 * Tops every series up to the horizon. Only dates strictly after the series' latest occurrence
 * and never before `today` are generated, so a gap the user deleted stays deleted, a long absence
 * does not backfill past days, and the call is idempotent. At most MAX_OCCURRENCES_PER_SERIES
 * occurrences dated today or later exist per series (past rows are not counted). A series with an
 * end date (`repeatUntil` of its latest occurrence) is never extended past it. Known
 * limitation: deleting the LAST occurrence of a series lets it be regenerated by the next call.
 * A date whose id is already taken (e.g. by an occurrence moved to another date) is skipped.
 */
export function extendSeries(tasks: Task[], today: string, horizonWeeks = DEFAULT_HORIZON_WEEKS): Task[] {
  return [...tasks, ...extensionsPerSeries(tasks, today, horizonWeeks).flat()];
}

/** The rows each series would gain, one array per series (empty ones included). */
function extensionsPerSeries(tasks: Task[], today: string, horizonWeeks: number): Task[][] {
  const end = horizonEnd(today, horizonWeeks);
  const bySeries = new Map<string, SeriesMember[]>();
  for (const task of tasks) {
    if (!isSeriesMember(task)) continue;
    const members = bySeries.get(task.seriesId);
    if (members) members.push(task);
    else bySeries.set(task.seriesId, [task]);
  }
  const taken = new Set(tasks.map(task => task.id));
  return [...bySeries.values()].map(members => extensionFor(members, today, end, taken));
}

/**
 * Like `extendSeries`, but only keeps what `fits` accepts (storage limits): when the whole top-up does
 * not fit, series are added one at a time and extension stops at the first one that does not, so as many
 * series as possible keep extending. Returns `tasks` itself when nothing could be added.
 */
export function extendSeriesWithin(
  tasks: Task[],
  today: string,
  fits: (list: Task[]) => boolean,
  horizonWeeks = DEFAULT_HORIZON_WEEKS,
): Task[] {
  const batches = extensionsPerSeries(tasks, today, horizonWeeks).filter(batch => batch.length > 0);
  if (batches.length === 0) return tasks;
  const all = [...tasks, ...batches.flat()];
  if (fits(all)) return all;
  let result = tasks;
  for (const batch of batches) {
    const next = [...result, ...batch];
    if (!fits(next)) break;
    result = next;
  }
  return result;
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

/**
 * Keeps the store invariants: backlog tasks have no series, unscheduled tasks have no reminder,
 * a task without a rule has no end date, and no task lies after its own end date.
 */
function normalize(task: Task): Task {
  let next = keepUntilValid(task);
  if (next.date === null && (next.seriesId != null || next.repeat != null)) next = { ...next, seriesId: null, repeat: null };
  if (next.start === null && next.remind != null) next = { ...next, remind: null };
  return next.repeat == null ? withUntil(next, null) : next;
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
  return withUntil({ ...task, seriesId: null, repeat: null }, null);
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
 * The anchor of a rule change made on `current` (dated `date`). A monthly series that stays monthly
 * keeps its dominant day-of-month, so editing a clamped occurrence (Feb 28) does not re-anchor it.
 */
function anchorFor(tasks: readonly Task[], current: Task, date: string): Anchor {
  const sameMonthly = current.seriesId != null && current.repeat === "monthly"
    ? tasks.filter(isSeriesMember).filter(t => t.seriesId === current.seriesId && t.repeat === "monthly")
    : [];
  return { weekday: weekdayOf(date), monthDay: sameMonthly.length > 0 ? dominantMonthDay(sameMonthly) : dayOfMonth(date) };
}

/**
 * Changes the repeat rule and/or end date from `task` onwards. With a rule, `task` keeps its
 * id/status/content and the series continues under the same seriesId (a new one for a plain task);
 * earlier occurrences keep their old rule and end date. Later occurrences whose dates still fall on
 * the new rule and not after the new end date are kept as they are (status and edits included; only
 * `repeat` and `repeatUntil` are updated), the others are deleted, and only the missing dates from
 * today on are added as `todo` (never more than MAX_OCCURRENCES_PER_SERIES dated today or later,
 * never after the end date). `until` is the new inclusive end date (null = never ends, which lets
 * the series extend again); left undefined it keeps the end date of `task`. It must not be before
 * `task`'s date. With a null rule, later occurrences are removed and `task` and the earlier ones
 * become plain tasks (otherwise extendSeries would regenerate them).
 */
export function changeRule(
  tasks: Task[],
  task: Task,
  newRule: Repeat | null,
  today: string,
  newSeriesId: () => string,
  horizonWeeks = DEFAULT_HORIZON_WEEKS,
  until?: string | null,
): Task[] {
  const current = tasks.find(t => t.id === task.id);
  if (!current) return [...tasks];
  if (newRule === null) return endSeries(tasks, current);
  if (current.date === null) throw new Error("Only a scheduled task can repeat: its date is null");
  const anchorDate = current.date;
  const end = until === undefined ? current.repeatUntil ?? null : until;
  if (end !== null && end < anchorDate) throw new Error("The end date must be on or after the task date");
  const anchor = anchorFor(tasks, current, anchorDate);
  const seriesId = current.seriesId ?? newSeriesId();
  const head = withUntil({ ...current, seriesId, repeat: newRule }, end);
  const kept = tasks.flatMap((t): Task[] => {
    if (t.id === current.id) return [head];
    if (t.seriesId !== seriesId || t.date === null || t.date <= anchorDate) return [t];
    if ((end !== null && t.date > end) || !firesOn(newRule, anchor, t.date)) return [];
    return [withUntil(t.repeat === newRule ? t : { ...t, repeat: newRule }, end)];
  });
  const members = kept.filter(t => t.seriesId === seriesId);
  const presentDates = new Set(members.map(t => t.date));
  const takenIds = new Set(kept.map(t => t.id));
  const room = Math.max(0, MAX_OCCURRENCES_PER_SERIES - countFuture(members, today));
  const generated = occurrenceDates(newRule, anchorDate, sooner(horizonEnd(today, horizonWeeks), end), Infinity, anchor.monthDay)
    .filter(day => day > anchorDate && day >= today && !presentDates.has(day))
    .map(day => occurrence(head, seriesId, newRule, day))
    .filter(next => !takenIds.has(next.id))
    .slice(0, room);
  return [...kept, ...generated];
}
