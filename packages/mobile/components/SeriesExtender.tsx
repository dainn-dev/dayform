import { useEffect } from "react";
import { AppState } from "react-native";
import { dateKey } from "@/lib/planner";
import { extendSeriesWithin } from "@/lib/recurrence";
import { fitsStoredLimits } from "@/lib/tasks-store";
import { useTasks } from "@/lib/tasks-context";

/**
 * Keeps recurring tasks materialised a few weeks ahead: after the tasks load, and whenever the app
 * returns to the foreground, new occurrences are appended through the store's serial write path.
 * The top-up stays within the storage limits (see `extendSeriesWithin`). The writes are silent: a background top-up must not raise or clear user-facing errors.
 * Renders nothing.
 */
export function SeriesExtender(): null {
  const { loading, mutate } = useTasks();

  useEffect(() => {
    if (loading) return undefined;
    const extend = (): void => {
      void mutate(
        current => {
          // Series are topped up one at a time within the storage limits, so one series that no longer
          // fits cannot stop the others (a refused whole-list write would be silent).
          return extendSeriesWithin(current, dateKey(new Date()), fitsStoredLimits);
        },
        { silent: true },
      );
    };
    extend();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") extend();
    });
    return () => subscription.remove();
  }, [loading, mutate]);

  return null;
}
