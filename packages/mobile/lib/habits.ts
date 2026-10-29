import { suggestDuration, type DurationSuggestion } from "./habits-duration";
import { focusHours, type FocusHours } from "./habits-focus";
import { mostRecent } from "./habits-history";
import { stalePastTasks, type StaleTasks } from "./habits-nudge";
import { suggestRepeat, type RepeatSuggestion } from "./habits-repeat";
import type { Task } from "./planner";

/** Habit hints learn from at most this many tasks (the most recent ones). */
export const MAX_HISTORY = 3000;

export type HabitHints = {
  duration: DurationSuggestion | null;
  repeat: RepeatSuggestion | null;
  focus: FocusHours | null;
  stale: StaleTasks;
};

export type HabitInput = {
  /** What the user has typed in the title field so far ("" when there is none). */
  typedTitle: string;
  tasks: readonly Task[];
  /** Tasks moved to the archive; they count as history for duration, repeat and focus hints. */
  archive?: readonly Task[];
  now: Date;
  /** The "Habit hints" setting. When false nothing is computed. */
  enabled: boolean;
};

/** What `computeHints` returns when the feature is off. Shared and never modified. */
export const EMPTY_HINTS: HabitHints = Object.freeze({
  duration: null,
  repeat: null,
  focus: null,
  stale: Object.freeze({ count: 0, ids: Object.freeze([] as string[]) }),
});

/** Main list first, so a task that is in both lists is counted once (the archive copy is dropped). */
function mergeHistory(tasks: readonly Task[], archive: readonly Task[] | undefined): readonly Task[] {
  if (!archive || archive.length === 0) return tasks;
  const seen = new Set(tasks.map(task => task.id));
  return [...tasks, ...archive.filter(task => !seen.has(task.id))];
}

/**
 * All habit hints in one call. Everything is derived from the user's own tasks on this device. Learned hints
 * (duration, repeat, focus) use the most recent `MAX_HISTORY` tasks of `tasks` plus `archive`; the stale count
 * looks at every task in `tasks` (archived tasks are all finished, so they never count).
 */
export function computeHints({ typedTitle, tasks, archive, now, enabled }: HabitInput): HabitHints {
  if (!enabled) return EMPTY_HINTS;
  const merged = mergeHistory(tasks, archive);
  const history = merged.length > MAX_HISTORY ? mostRecent(merged, MAX_HISTORY) : merged;
  return {
    duration: suggestDuration(typedTitle, history),
    repeat: suggestRepeat(typedTitle, history, now),
    focus: focusHours(history, now),
    stale: stalePastTasks(tasks, now),
  };
}
