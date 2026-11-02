import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useTasks } from "../lib/tasks-context";
import { applyWidgetToggles, parseWidgetToggles, toggleReceipt } from "../lib/widget-actions";
import { ackWidgetToggles, getPendingWidgetToggles, isWidgetSupported } from "../modules/dayform-widget";

/**
 * Applies the ticks made on the home-screen widget to the real task list, then tells the widget they are done.
 * It waits until the tasks are loaded and writable, and runs at start and whenever the app returns to the front.
 * Finishing a task this way earns experience like any other completion. Renders nothing.
 */
export function WidgetActions(): null {
  const { loading, writesBlocked, mutate } = useTasks();
  const usable = !loading && !writesBlocked;
  const usableRef = useRef(usable);
  usableRef.current = usable;
  const running = useRef(false);

  const apply = useCallback(async (): Promise<void> => {
    if (running.current || !usableRef.current || !isWidgetSupported()) return;
    running.current = true;
    try {
      const toggles = parseWidgetToggles(getPendingWidgetToggles());
      if (toggles.length === 0) return;
      // A quiet write: the widget already shows the result, so a failure is retried next time instead of shown.
      if (await mutate(applyWidgetToggles(toggles), { silent: true })) await ackWidgetToggles(toggleReceipt(toggles));
    } finally {
      running.current = false;
    }
  }, [mutate]);

  useEffect(() => {
    if (usable) void apply();
  }, [usable, apply]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void apply(); });
    return () => subscription.remove();
  }, [apply]);

  return null;
}
