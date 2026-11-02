import { z } from "zod";
import { addDays, type Category } from "./planner";
import type { DateRange, Stats } from "./stats";

/**
 * Weekly goals: "5 hours of Wellness a week". A goal counts the minutes of FINISHED tasks of its category; one goal per
 * category. Over a month the target is scaled by the number of days. Pure: no React and no storage (lib/goals-store.ts).
 */
export const MAX_GOALS = 12;
export const MIN_GOAL_MINUTES = 15;
export const MAX_GOAL_MINUTES = 10_080;
/** Choices offered when setting a goal, in minutes per week. */
export const GOAL_CHOICES = [60, 120, 180, 300, 600, 900, 1200] as const;
const DAYS_PER_WEEK = 7;
const ID_PATTERN = /^g_[a-z0-9]{8}$/;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export type Goal = { id: string; category: Category; minutesPerWeek: number };
export type GoalsState = { items: Goal[] };
export const DEFAULT_GOALS_STATE: GoalsState = { items: [] };

export type GoalFailure = "invalid-minutes" | "invalid-category" | "limit" | "unknown";
export type GoalResult = { ok: true; state: GoalsState; id?: string } | { ok: false; reason: GoalFailure };

export function generateGoalId(random: () => number = Math.random): string {
  let id = "g_";
  for (let i = 0; i < 8; i += 1) id += ID_ALPHABET[Math.min(ID_ALPHABET.length - 1, Math.floor(random() * ID_ALPHABET.length))];
  return id;
}

const goalSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  category: z.string().min(1).max(40),
  minutesPerWeek: z.number().int().min(MIN_GOAL_MINUTES).max(MAX_GOAL_MINUTES),
});

/** Reads stored text. `lossy` is true when a goal was dropped (or two shared a category), so the caller keeps a copy first. */
export function parseGoalsText(text: string): { state: GoalsState; valid: boolean; lossy: boolean } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: DEFAULT_GOALS_STATE, valid: false, lossy: true };
  }
  const list = typeof raw === "object" && raw !== null && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : null;
  if (list === null) return { state: DEFAULT_GOALS_STATE, valid: false, lossy: true };
  const ids = new Set<string>();
  const categories = new Set<string>();
  const items: Goal[] = [];
  for (const record of list.slice(0, MAX_GOALS)) {
    const parsed = goalSchema.safeParse(record);
    if (!parsed.success || ids.has(parsed.data.id) || categories.has(parsed.data.category)) continue;
    ids.add(parsed.data.id);
    categories.add(parsed.data.category);
    items.push(parsed.data);
  }
  return { state: { items }, valid: true, lossy: items.length !== list.length };
}

/** Sets the goal of a category: a new one, or the new target of the category's existing goal. */
export function setGoal(state: GoalsState, category: Category, minutesPerWeek: number, id: string = generateGoalId()): GoalResult {
  if (category.trim() === "" || category.length > 40) return { ok: false, reason: "invalid-category" };
  if (!Number.isInteger(minutesPerWeek) || minutesPerWeek < MIN_GOAL_MINUTES || minutesPerWeek > MAX_GOAL_MINUTES) return { ok: false, reason: "invalid-minutes" };
  const existing = state.items.find(goal => goal.category === category);
  if (existing) {
    if (existing.minutesPerWeek === minutesPerWeek) return { ok: true, state, id: existing.id };
    return { ok: true, state: { items: state.items.map(goal => (goal === existing ? { ...goal, minutesPerWeek } : goal)) }, id: existing.id };
  }
  if (state.items.length >= MAX_GOALS) return { ok: false, reason: "limit" };
  return { ok: true, state: { items: [...state.items, { id, category, minutesPerWeek }] }, id };
}

export function removeGoal(state: GoalsState, id: string): GoalResult {
  if (!state.items.some(goal => goal.id === id)) return { ok: false, reason: "unknown" };
  return { ok: true, state: { items: state.items.filter(goal => goal.id !== id) } };
}

export type GoalProgress = {
  goal: Goal;
  doneMinutes: number;
  targetMinutes: number;
  /** 0..1, capped: the bar never overflows. */
  ratio: number;
  reached: boolean;
};

function daysIn(range: DateRange): number {
  let days = 0;
  for (let day = range.from; day <= range.to && days < 400; day = addDays(day, 1)) days += 1;
  return days;
}

/** Progress of every goal over `range` (a week or a month); the target grows with the number of days. */
export function goalsProgress(goals: readonly Goal[], stats: Pick<Stats, "perCategory">, range: DateRange): GoalProgress[] {
  const factor = daysIn(range) / DAYS_PER_WEEK;
  return goals.map(goal => {
    const doneMinutes = stats.perCategory[goal.category]?.doneMinutes ?? 0;
    const targetMinutes = Math.round(goal.minutesPerWeek * factor);
    return { goal, doneMinutes, targetMinutes, ratio: targetMinutes === 0 ? 0 : Math.min(1, doneMinutes / targetMinutes), reached: doneMinutes >= targetMinutes };
  });
}
