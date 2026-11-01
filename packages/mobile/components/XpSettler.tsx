import { useEffect } from "react";
import { AppState } from "react-native";
import { useXp } from "../lib/xp-context";

/** Foreground check for a day that rolled over while the app stayed open. */
const RECHECK_MS = 10 * 60_000;

/**
 * Renders nothing. Judges the days that are over (rest days, penalties, the streak) once the experience is read, whenever the
 * app comes to the front, and now and then while it stays open across midnight. Judging a day twice changes nothing.
 */
export function XpSettler() {
  const { ready, enabled, locked, settle } = useXp();
  useEffect(() => {
    if (!ready || !enabled || locked) return;
    void settle();
    const sub = AppState.addEventListener("change", next => { if (next === "active") void settle(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void settle(); }, RECHECK_MS);
    return () => { sub.remove(); clearInterval(timer); };
  }, [ready, enabled, locked, settle]);
  return null;
}
