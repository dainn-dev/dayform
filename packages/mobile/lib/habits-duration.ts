import { isDone, mostRecent } from "./habits-history";
import { similarTitles } from "./habits-title";
import type { Task } from "./planner";

const MAX_MATCHES = 10;
const MIN_MATCHES = 2;
const ROUND_TO_MINUTES = 5;
const MIN_MINUTES = 5;
const MAX_MINUTES = 720;
/** The matches disagree too much when their median absolute deviation exceeds this share of the median. */
const MAX_RELATIVE_SPREAD = 0.5;

export type DurationSuggestion = {
  /** Suggested duration, a multiple of 5 between 5 and 720. */
  minutes: number;
  /** How many similar finished tasks it is based on (2 to 10). */
  basedOn: number;
  /** The most common category among them (an opaque string), or null when there is no single winner. */
  category: string | null;
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function topCategory(tasks: readonly Task[]): string | null {
  const counts = new Map<string, number>();
  for (const task of tasks) counts.set(task.category, (counts.get(task.category) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [category, count] of counts) {
    if (count > bestCount) { best = category; bestCount = count; tied = false; }
    else if (count === bestCount) tied = true;
  }
  return tied ? null : best;
}

const hasUsableDuration = (task: Task): boolean => isDone(task) && Number.isFinite(task.duration) && task.duration > 0;

/**
 * How long a task titled like `typed` usually takes: the median of the durations of the 10 most recent finished
 * tasks with a similar title, rounded to 5 minutes. Null with fewer than 2 matches, when the matches disagree
 * wildly, or when the result is outside 5..720 minutes.
 */
export function suggestDuration(typed: string, history: readonly Task[]): DurationSuggestion | null {
  const matches = mostRecent(similarTitles(typed, history.filter(hasUsableDuration)), MAX_MATCHES);
  if (matches.length < MIN_MATCHES) return null;
  const durations = matches.map(task => task.duration);
  const middle = median(durations);
  const spread = median(durations.map(duration => Math.abs(duration - middle)));
  if (spread > middle * MAX_RELATIVE_SPREAD) return null;
  const minutes = Math.round(middle / ROUND_TO_MINUTES) * ROUND_TO_MINUTES;
  if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) return null;
  return { minutes, basedOn: matches.length, category: topCategory(matches) };
}
