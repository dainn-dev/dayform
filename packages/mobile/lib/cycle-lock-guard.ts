import { shouldRequireUnlock } from "./cycle-lock";
import type { AuthStatus } from "./cycle-lock-result";

/**
 * Pure decisions for the actions outside the cycle screen that read or replace the tracker's data (backup export,
 * import, restore). They follow the cycle screen's own lock: the same switch, the same session window.
 */
export type CycleAuthInput = {
  /** The tracker holds data worth protecting (`hasCycleData` of the current state, read safely). */
  hasData: boolean;
  lockEnabled: boolean;
  /** The action reads the tracker (an export that includes it) or writes it (an import or restore that carries it). */
  touchesTracker: boolean;
  timeoutSec: number;
  /** The cycle screen's session (`readUnlockedAt`): an open window counts as already verified. */
  unlockedAt: number | null;
  now: number;
};

/** True when the user must be verified first. An unlocked window of the cycle screen counts as verified. */
export function needsCycleAuth(input: CycleAuthInput): boolean {
  if (!input.hasData || !input.touchesTracker) return false;
  return shouldRequireUnlock({
    lockEnabled: input.lockEnabled, timeoutSec: input.timeoutSec, unlockedAt: input.unlockedAt, now: input.now,
  });
}

/**
 * Whether the action may go on after the phone's check. A phone with no screen lock cannot be asked (the cycle
 * screen lets the user in too, since the app cannot force a lock); a cancel or a failure stops the action.
 */
export const authAllows = (status: AuthStatus): boolean => status === "success" || status === "unavailable";

/** Translation key (lib/i18n/cycle-privacy.ts): neutral, it does not say what the data is. */
export const AUTH_DENIED_MESSAGE = "Could not confirm it is you, so nothing was changed.";
/** Translation key: the prompt text of the phone's own check. Neutral too. */
export const AUTH_PROMPT_MESSAGE = "Confirm it is you to continue";
