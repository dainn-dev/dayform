import { useEffect } from "react";
import { AppState } from "react-native";
import { dateKey } from "@/lib/planner";
import { extendSeries } from "@/lib/recurrence";
import { useTasks } from "@/lib/tasks-context";

/**
 * Keeps recurring tasks materialised a few weeks ahead: after the tasks load, and whenever the app
 * returns to the foreground, new occurrences are appended through the store's serial write path.
 * Renders nothing.
 */
export function SeriesExtender(): null {
  const { loading, mutate } = useTasks();

  useEffect(() => {
    if (loading) return undefined;
    const extend = (): void => {
      void mutate(current => {
        const next = extendSeries(current, dateKey(new Date()));
        return next.length === current.length ? current : next;
      });
    };
    extend();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") extend();
    });
    return () => subscription.remove();
  }, [loading, mutate]);

  return null;
}
