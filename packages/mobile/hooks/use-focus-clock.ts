import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { isDue } from "../lib/focus";
import { useFocus } from "../lib/focus-context";

const TICK_MS = 1000;

/**
 * The current time in ms, ticking every second while a focus session runs (and refreshed when the app returns to the
 * front); a phase that has run out is settled here, so the screen moves on to the break by itself.
 */
export function useFocusClock(): number {
  const { session, settle } = useFocus();
  const [now, setNow] = useState(() => Date.now());
  const running = session !== null && session.pausedAt === null;

  useEffect(() => {
    setNow(Date.now());
    if (!running) return undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (session !== null && isDue(session, current)) void settle();
    };
    const timer = setInterval(tick, TICK_MS);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") tick(); });
    tick();
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [running, session, settle]);

  return now;
}
