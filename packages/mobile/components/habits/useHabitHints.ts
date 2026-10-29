import { useEffect, useMemo, useState } from "react";
import { EMPTY_HINTS, MAX_HISTORY, computeHints, type HabitHints } from "../../lib/habits";
import { suggestDuration } from "../../lib/habits-duration";
import { mostRecent } from "../../lib/habits-history";
import { suggestRepeat } from "../../lib/habits-repeat";
import { fromKey, type Task } from "../../lib/planner";
import { useSettings } from "../../lib/settings-context";
import { useTasks } from "../../lib/tasks-context";
import { useTodayKey } from "../stats/use-today-key";

const TYPING_DEBOUNCE_MS = 250;

type Options = {
  /** What the user has typed in the title field. Leave empty when no per-title hint is wanted. */
  typedTitle?: string;
  /** Also compute the heavy, title-independent parts (focus hours, stale tasks). */
  summary?: boolean;
};

/** The value, but only after it has stayed the same for `delayMs`. The timer is cleared on change and on unmount. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (settled === value) return undefined;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, settled, delayMs]);
  return settled;
}

const learningHistory = (tasks: readonly Task[]): readonly Task[] =>
  tasks.length > MAX_HISTORY ? mostRecent(tasks, MAX_HISTORY) : tasks;

/**
 * Habit hints derived from the user's own tasks. Nothing is computed while the "Habit hints" setting is off.
 * `now` is the start of the local day, so results only refresh when tasks change, the typed title settles
 * (debounced) or the day rolls over. The title-dependent hints (duration, repeat) are kept apart from the
 * heavier focus/stale scan, so typing never re-runs the scan.
 */
export function useHabitHints({ typedTitle = "", summary = false }: Options = {}): HabitHints {
  const enabled = useSettings().settings.habits.hints;
  const { tasks } = useTasks();
  const today = useTodayKey();
  const now = useMemo(() => fromKey(today), [today]);
  const settledTitle = useDebounced(typedTitle, TYPING_DEBOUNCE_MS);
  // A cleared field must not keep showing the old hint while the debounce runs.
  const title = typedTitle.trim() === "" ? "" : settledTitle;

  const typed = useMemo(() => {
    if (!enabled || title.trim() === "") return null;
    const history = learningHistory(tasks);
    return { duration: suggestDuration(title, history), repeat: suggestRepeat(title, history, now) };
  }, [enabled, title, tasks, now]);

  const overview = useMemo(
    () => (enabled && summary ? computeHints({ typedTitle: "", tasks, now, enabled }) : EMPTY_HINTS),
    [enabled, summary, tasks, now],
  );

  return useMemo(() => ({
    duration: typed?.duration ?? null,
    repeat: typed?.repeat ?? null,
    focus: overview.focus,
    stale: overview.stale,
  }), [typed, overview]);
}
