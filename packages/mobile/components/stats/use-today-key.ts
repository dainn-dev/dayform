import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { dateKey } from "../../lib/planner";

const CHECK_INTERVAL_MS = 60_000;

/**
 * Today's date key. Unlike `useNow` the state is the key itself, so the screen re-renders only when the
 * date changes (midnight, or the app returning to the foreground on a later day), not every minute.
 */
export function useTodayKey(): string {
  const [today, setToday] = useState(() => dateKey(new Date()));
  useEffect(() => {
    const refresh = () => setToday(dateKey(new Date()));
    refresh();
    const id = setInterval(refresh, CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(id);
      subscription.remove();
    };
  }, []);
  return today;
}
