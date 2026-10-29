import { useEffect, useState } from "react";
import { AppState } from "react-native";

const MINUTE_MS = 60_000;

/**
 * The current time, refreshed every `intervalMs` and whenever the app returns to the
 * foreground (a backgrounded app's timers are paused, so the clock could be hours stale).
 */
export function useNow(intervalMs: number = MINUTE_MS): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const id = setInterval(refresh, intervalMs);
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs]);
  return now;
}
