import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useCycle } from "../../lib/cycle-context";
import { nextUnlockState, type UnlockEvent } from "../../lib/cycle-lock";
import { authenticate, probeLock } from "../../lib/cycle-lock-expo";
import { continueAllowed } from "../../lib/cycle-lock-result";
import {
  activityEvent, appStateEvent, continueEvent, gateView, msUntilRelock, outcomeOf, type GateView, type LockNotice,
} from "../../lib/cycle-lock-gate";
import { readUnlockedAt, writeUnlockedAt } from "../../lib/cycle-lock-session";
import { useLanguage } from "../../lib/language";

const isHidden = (appState: string | null | undefined): boolean => appState === "background" || appState === "inactive";

export type CycleLock = {
  view: GateView;
  notice: LockNotice;
  busy: boolean;
  /** The app is not in the foreground: the content must be hidden (app switcher, recents). */
  covered: boolean;
  unlock: () => Promise<void>;
  /** Continue although the phone has no screen lock to check against; re-checks first and otherwise shows the retry state. */
  continueAnyway: () => Promise<void>;
  /** Call on every touch of the open screen; keeps the inactivity window alive. */
  noteActivity: () => void;
};

/**
 * Glue between the pure lock logic and the platform: the unlock time lives in a module-level session (so leaving and
 * re-entering within the timeout stays unlocked and a cold start always asks), AppState backgrounding counts as
 * leaving, and a timer re-locks when the inactivity window ends. Locked is the default until the settings are read.
 */
export function useCycleLock(): CycleLock {
  const { t } = useLanguage();
  const { state, ready } = useCycle();
  const { enabled: lockEnabled, timeoutSec } = state.lock;
  const [unlockedAt, setUnlockedAt] = useState<number | null>(readUnlockedAt);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<LockNotice>("none");
  const [busy, setBusy] = useState(false);
  const [covered, setCovered] = useState(isHidden(AppState.currentState));
  const unlockedRef = useRef(unlockedAt);
  const timeoutRef = useRef(timeoutSec);
  const promptedRef = useRef(false);
  const busyRef = useRef(false);
  timeoutRef.current = timeoutSec;

  const apply = useCallback((event: UnlockEvent, at: number) => {
    const next = nextUnlockState(unlockedRef.current, event);
    unlockedRef.current = next;
    writeUnlockedAt(next);
    setUnlockedAt(next);
    setNow(at);
  }, []);

  const view = gateView({ ready, lockEnabled, timeoutSec, unlockedAt, now });

  // While the lock is off the user is simply present: stamp the visit so turning the lock on later does not throw them out.
  useEffect(() => {
    if (ready && !lockEnabled && unlockedRef.current === null) {
      const at = Date.now();
      apply({ type: "unlocked", now: at }, at);
    }
  }, [ready, lockEnabled, apply]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", next => {
      setCovered(isHidden(next));
      const event = appStateEvent(next, timeoutRef.current);
      if (event !== null) apply(event, Date.now());
      else if (next === "active") setNow(Date.now());
    });
    return () => {
      subscription.remove();
      // Leaving the screen counts as `left`: with "every time" the next visit asks again.
      writeUnlockedAt(nextUnlockState(unlockedRef.current, { type: "left", timeoutSec: timeoutRef.current }));
    };
  }, [apply]);

  useEffect(() => {
    const delay = view === "open" ? msUntilRelock(unlockedAt, now, timeoutSec) : null;
    if (delay === null) return;
    const id = setTimeout(() => setNow(Date.now()), delay + 1);
    return () => clearTimeout(id);
  }, [view, unlockedAt, now, timeoutSec]);

  const unlock = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await authenticate({ message: t("Unlock to continue"), cancelLabel: t("Cancel") });
      const at = Date.now();
      const outcome = outcomeOf(result.status, at);
      if (outcome.event !== null) apply(outcome.event, at);
      setNotice(outcome.notice);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [apply, t]);

  // Prompt once per locked episode; a cancelled prompt is not repeated until the user presses Unlock.
  useEffect(() => {
    if (view !== "locked") { promptedRef.current = false; return; }
    if (promptedRef.current || covered) return;
    promptedRef.current = true;
    void unlock();
  }, [view, covered, unlock]);

  const continueAnyway = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      // The earlier "unavailable" may have been a transient error: only a phone that truly has no lock may continue.
      if (!continueAllowed(await probeLock())) {
        setNotice("failed");
        return;
      }
      const at = Date.now();
      apply(continueEvent(at), at);
      setNotice("none");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [apply]);

  const noteActivity = useCallback(() => {
    const at = Date.now();
    const event = activityEvent(unlockedRef.current, at, timeoutRef.current);
    if (event === null) return;
    // With the lock off the visit is simply stamped, so switching the lock on later does not lock the user out.
    apply(lockEnabled ? event : continueEvent(at), at);
  }, [apply, lockEnabled]);

  return { view, notice, busy, covered, unlock, continueAnyway, noteActivity };
}
