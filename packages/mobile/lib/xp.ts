import { z } from "zod";
import { addDays, dateKey, mondayOf, type Task } from "./planner";
import { CULTIVATION, rankOf, realmStart, type Ladder } from "./realm";

/**
 * Cultivation experience (framework-free, tested). Finishing a task earns experience once; a day without any finished task
 * is a missed day, which is free while the rest allowance lasts (1 per week and 4 per month, resting keeps the streak) and
 * costs experience after that. Overdue tasks are never penalised: only the days.
 *
 * The state lives under its own key and never inside a task, so an older build that rewrites the tasks cannot damage it.
 * `claimed` makes the points per task: reopening and finishing a task again earns nothing, and undoing a completion takes
 * back exactly what it gave.
 */
export const XP_KEY = "dayform.xp.v1";

export const REST_PER_WEEK = 1;
export const REST_PER_MONTH = 4;
/** The most one day can earn; the rest of a busy day counts for nothing. */
export const DAILY_CAP = 600;
const MAX_TASK_XP = 60;
/** A task finished this soon after it was created earns a quarter: logging and ticking at once is not a deed. */
const QUICK_MS = 2 * 60_000;
const QUICK_FACTOR = 0.25;
/** First penalty and its growth per consecutive penalised day (capped). */
const PENALTY_BASE = 40;
const PENALTY_STEPS_CAP = 5;
/** From this many penalised days in a row the penalty can pull the rank below the start of the current realm. */
export const DEMOTION_STREAK = 3;
/** After a long absence only the latest days are judged; earlier ones are treated as retreat and cost nothing. */
export const MAX_SETTLE_DAYS = 14;
const KEEP_DAYS = 400;

export const DAY_FACTOR = { today: 1, backlog: 0.8, past: 0.6, future: 0.5 } as const;

/** What a streak of active days multiplies the experience by. */
export function streakFactor(streak: number): number {
  if (streak >= 30) return 1.5;
  if (streak >= 7) return 1.25;
  if (streak >= 3) return 1.1;
  return 1;
}

const claimSchema = z.object({ xp: z.number().int().min(0), day: z.string() });
const daySchema = z.object({ xp: z.number().int().min(0).catch(0), done: z.number().int().min(0).catch(0) });

export const xpSchema = z.object({
  total: z.number().int().min(0).catch(0),
  /** The first day that counts; days before it are never judged. */
  startDay: z.string().nullable().catch(null),
  /** The last day already judged (a day is judged once it is over). */
  settledDay: z.string().nullable().catch(null),
  streak: z.number().int().min(0).catch(0),
  best: z.number().int().min(0).catch(0),
  penaltyStreak: z.number().int().min(0).catch(0),
  claimed: z.record(z.string(), claimSchema.catch({ xp: 0, day: "" })).catch({}),
  days: z.record(z.string(), daySchema).catch({}),
  /** Days spent as rest, kept for about two months. */
  restDays: z.array(z.string()).catch([]),
});
export type XpState = z.output<typeof xpSchema>;

export const EMPTY_XP: XpState = { total: 0, startDay: null, settledDay: null, streak: 0, best: 0, penaltyStreak: 0, claimed: {}, days: {}, restDays: [] };

export function parseXpText(text: string): { state: XpState; valid: boolean } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: EMPTY_XP, valid: false };
  }
  const parsed = xpSchema.safeParse(raw);
  return parsed.success ? { state: parsed.data, valid: true } : { state: EMPTY_XP, valid: false };
}

// ---- Experience for one task ----

/**
 * A task planned for a day that was already over when it was created (made today for yesterday) is added after the fact:
 * it earns nothing and does not count as a day of work, so nothing can be backfilled to collect points or to dodge a penalty.
 */
export function isLateAdded(task: Task): boolean {
  if (task.date === null) return false;
  const created = Date.parse(task.createdAt);
  return Number.isFinite(created) && task.date < dateKey(new Date(created));
}

/** Experience a task earns when finished now, before the streak and the daily cap; 0 for a task added after the fact. */
export function taskXp(task: Task, now: Date): number {
  if (isLateAdded(task)) return 0;
  const base = Math.min(MAX_TASK_XP, Math.max(10, Math.round(task.duration / 15) * 10));
  const today = dateKey(now);
  const factor = task.date === null ? DAY_FACTOR.backlog : task.date === today ? DAY_FACTOR.today : task.date < today ? DAY_FACTOR.past : DAY_FACTOR.future;
  const created = Date.parse(task.createdAt);
  const quick = Number.isFinite(created) && now.getTime() - created >= 0 && now.getTime() - created < QUICK_MS ? QUICK_FACTOR : 1;
  return Math.max(1, Math.round(base * factor * quick));
}

// ---- Earning and taking back ----

export type ClaimResult = { state: XpState; gained: number; claimedIds: string[]; rankUp: boolean };

/** Gives the experience for tasks just finished. A task already claimed, or one not done, earns nothing. */
export function claimTasks(state: XpState, tasks: readonly Task[], now: Date, ladder: Ladder = CULTIVATION): ClaimResult {
  const today = dateKey(now);
  const startDay = state.startDay ?? today;
  const factor = streakFactor(state.streak);
  const day = state.days[today] ?? { xp: 0, done: 0 };
  let dayXp = day.xp;
  let done = day.done;
  let gained = 0;
  const claimed = { ...state.claimed };
  const claimedIds: string[] = [];
  for (const task of tasks) {
    if (task.status !== "done" || claimed[task.id]) continue;
    const room = Math.max(0, DAILY_CAP - dayXp);
    const eligible = !isLateAdded(task);
    const xp = Math.min(room, Math.round(taskXp(task, now) * factor));
    // Recorded even when it earns nothing, so a later edit of its date cannot make it earn.
    claimed[task.id] = { xp, day: today };
    claimedIds.push(task.id);
    dayXp += xp;
    gained += xp;
    if (eligible) done += 1;
  }
  if (claimedIds.length === 0) return { state, gained: 0, claimedIds, rankUp: false };
  const total = state.total + gained;
  const next: XpState = { ...state, total, startDay, claimed, days: { ...state.days, [today]: { xp: dayXp, done } } };
  return { state: next, gained, claimedIds, rankUp: rankOf(total, ladder).step > rankOf(state.total, ladder).step };
}

/** Takes back what the given tasks gave (a completion that was undone, or a task that was deleted). */
export function revokeTasks(state: XpState, ids: readonly string[]): XpState {
  let total = state.total;
  const claimed = { ...state.claimed };
  const days = { ...state.days };
  let changed = false;
  for (const id of ids) {
    const entry = claimed[id];
    if (!entry) continue;
    changed = true;
    delete claimed[id];
    total = Math.max(0, total - entry.xp);
    const day = days[entry.day];
    if (day) days[entry.day] = { xp: Math.max(0, day.xp - entry.xp), done: Math.max(0, day.done - 1) };
  }
  return changed ? { ...state, total, claimed, days } : state;
}

// ---- Judging the days that are over ----

export type SettleEvent =
  | { type: "rest"; day: string }
  | { type: "penalty"; day: string; amount: number; demoted: boolean };

export type SettleResult = { state: XpState; events: SettleEvent[] };

const monthOf = (day: string) => day.slice(0, 7);

/** Whether a missed day can still be a rest day: the week and the month must both have allowance left. */
export function restAvailable(restDays: readonly string[], day: string): boolean {
  const week = mondayOf(day);
  const month = monthOf(day);
  const inWeek = restDays.filter(rest => mondayOf(rest) === week).length;
  const inMonth = restDays.filter(rest => monthOf(rest) === month).length;
  return inWeek < REST_PER_WEEK && inMonth < REST_PER_MONTH;
}

/** The experience a penalised day costs, and the lowest total it may leave. */
export function penaltyFor(total: number, penaltyStreak: number, ladder: Ladder = CULTIVATION): { amount: number; floor: number } {
  const amount = PENALTY_BASE * Math.min(penaltyStreak, PENALTY_STEPS_CAP);
  const floor = penaltyStreak >= DEMOTION_STREAK ? 0 : realmStart(rankOf(total, ladder).realm, ladder);
  return { amount, floor };
}

/**
 * Judges every day that is over and not yet judged (never today): a day with a finished task grows the streak; an empty day
 * is a rest day while the allowance lasts and a penalised day after it. The first call only starts the clock.
 */
export function settleDays(state: XpState, now: Date, ladder: Ladder = CULTIVATION): SettleResult {
  const today = dateKey(now);
  if (state.startDay === null) return { state: { ...state, startDay: today, settledDay: addDays(today, -1) }, events: [] };
  const yesterday = addDays(today, -1);
  let from = state.settledDay === null ? state.startDay : addDays(state.settledDay, 1);
  if (from < state.startDay) from = state.startDay;
  if (from > yesterday) return { state: prune(state, today), events: [] };
  const earliest = addDays(yesterday, -(MAX_SETTLE_DAYS - 1));
  if (from < earliest) from = earliest;

  let { total, streak, best, penaltyStreak } = state;
  const restDays = [...state.restDays];
  const events: SettleEvent[] = [];
  for (let day = from; day <= yesterday; day = addDays(day, 1)) {
    if ((state.days[day]?.done ?? 0) > 0) {
      streak += 1;
      best = Math.max(best, streak);
      penaltyStreak = 0;
    } else if (restAvailable(restDays, day)) {
      restDays.push(day);
      events.push({ type: "rest", day });
    } else {
      penaltyStreak += 1;
      streak = 0;
      const before = total;
      const { amount, floor } = penaltyFor(total, penaltyStreak, ladder);
      total = Math.max(Math.min(total, floor), total - amount);
      events.push({ type: "penalty", day, amount: before - total, demoted: rankOf(total, ladder).realm < rankOf(before, ladder).realm });
    }
  }
  return { state: prune({ ...state, total, streak, best, penaltyStreak, restDays, settledDay: yesterday }, today), events };
}

/** Drops what is older than the history that matters, so the stored value stays small. */
function prune(state: XpState, today: string): XpState {
  const cutoff = addDays(today, -KEEP_DAYS);
  const restCutoff = addDays(today, -62);
  const days = Object.fromEntries(Object.entries(state.days).filter(([day]) => day >= cutoff));
  const claimed = Object.fromEntries(Object.entries(state.claimed).filter(([, entry]) => entry.day >= cutoff));
  const restDays = state.restDays.filter(day => day >= restCutoff);
  const same = Object.keys(days).length === Object.keys(state.days).length
    && Object.keys(claimed).length === Object.keys(state.claimed).length && restDays.length === state.restDays.length;
  return same ? state : { ...state, days, claimed, restDays };
}

// ---- Reading the state ----

/** How many rest days are left this week and this month, for the screen. */
export function restLeft(state: XpState, now: Date): { week: number; month: number } {
  const today = dateKey(now);
  const week = mondayOf(today);
  const month = monthOf(today);
  return {
    week: Math.max(0, REST_PER_WEEK - state.restDays.filter(day => mondayOf(day) === week).length),
    month: Math.max(0, REST_PER_MONTH - state.restDays.filter(day => monthOf(day) === month).length),
  };
}

/** What the day earned so far. */
export function todayXp(state: XpState, now: Date): number {
  return state.days[dateKey(now)]?.xp ?? 0;
}

/** A file's experience joined to the current one: the bigger total wins (a restore must not erase progress by accident). */
export function mergeXp(current: XpState, incoming: XpState, mode: "merge" | "replace"): XpState {
  if (mode === "replace") return incoming;
  const base = incoming.total > current.total ? incoming : current;
  return { ...base, claimed: { ...incoming.claimed, ...current.claimed }, days: { ...incoming.days, ...current.days }, best: Math.max(current.best, incoming.best) };
}

