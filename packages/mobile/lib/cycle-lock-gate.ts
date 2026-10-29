import { shouldRequireUnlock, type UnlockEvent } from "./cycle-lock";
import type { AuthStatus } from "./cycle-lock-result";

/** Pure decisions behind components/cycle/CycleLockGate.tsx, so the component only forwards events and renders. */
export type GateInput = {
  /** The stored tracker settings were read. */
  ready: boolean;
  lockEnabled: boolean;
  timeoutSec: number;
  unlockedAt: number | null;
  now: number;
};
export type GateView = "loading" | "open" | "locked";

/** `loading` and `locked` never show the private content. */
export function gateView(input: GateInput): GateView {
  if (!input.ready) return "loading";
  return shouldRequireUnlock(input) ? "locked" : "open";
}

export type LockNotice = "none" | "cancelled" | "failed" | "unavailable";
export type AuthOutcome = { event: UnlockEvent | null; notice: LockNotice };

/** Only a successful check unlocks. "Unavailable" waits for the user's explicit Continue (see `continueEvent`). */
export function outcomeOf(status: AuthStatus, now: number): AuthOutcome {
  if (status === "success") return { event: { type: "unlocked", now }, notice: "none" };
  return { event: null, notice: status };
}

/** The user continues although the phone has no screen lock: access is granted for the usual window, the next visit asks again. */
export const continueEvent = (now: number): UnlockEvent => ({ type: "unlocked", now });

/**
 * Backgrounding the app counts as leaving the screen. Only `background` does: `inactive` also fires while the
 * system's own authentication prompt is on screen, and treating that as leaving would lock the user right after
 * a successful unlock.
 */
export function appStateEvent(next: string, timeoutSec: number): UnlockEvent | null {
  return next === "background" ? { type: "left", timeoutSec } : null;
}

/** Milliseconds until an unlocked window closes, or null when it does not close by itself (no timeout or locked). */
export function msUntilRelock(unlockedAt: number | null, now: number, timeoutSec: number): number | null {
  if (unlockedAt === null || timeoutSec <= 0) return null;
  return Math.max(0, unlockedAt + timeoutSec * 1000 - now);
}

/** Minimum gap between activity stamps, so a scroll does not re-render the screen on every touch. */
export const ACTIVITY_THROTTLE_MS = 2000;

/** The activity event for a touch, or null when the last stamp is recent or the screen is not open. */
export function activityEvent(unlockedAt: number | null, now: number, timeoutSec: number): UnlockEvent | null {
  if (unlockedAt === null || now - unlockedAt < ACTIVITY_THROTTLE_MS) return null;
  return { type: "activity", now, timeoutSec };
}
