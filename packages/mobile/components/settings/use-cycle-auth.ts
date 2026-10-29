import { useCallback } from "react";
import { hasCycleData } from "../../lib/cycle";
import { useCycle } from "../../lib/cycle-context";
import { authenticate } from "../../lib/cycle-lock-expo";
import { AUTH_PROMPT_MESSAGE, authAllows, needsCycleAuth } from "../../lib/cycle-lock-guard";
import { readUnlockedAt } from "../../lib/cycle-lock-session";
import { useLanguage } from "../../lib/language";

/**
 * Returns `authorize()` for the actions outside the cycle screen that read or replace the tracker (export, import,
 * restore). Call it only for an action that touches the tracker. It resolves true at once when no check is needed (no
 * tracker data, lock off, or the cycle screen's unlock window is still open) and otherwise asks the phone to verify
 * the user. A cancel or a failure resolves false; a phone with no screen lock resolves true, like the cycle screen.
 * Thin glue: the decisions are in lib/cycle-lock-guard.ts.
 */
export function useCycleAuth(): () => Promise<boolean> {
  const { t } = useLanguage();
  const { state, ready, locked } = useCycle();
  const hasData = ready && !locked && hasCycleData(state);
  const { enabled: lockEnabled, timeoutSec } = state.lock;
  return useCallback(async () => {
    const needed = needsCycleAuth({
      hasData, lockEnabled, touchesTracker: true, timeoutSec, unlockedAt: readUnlockedAt(), now: Date.now(),
    });
    if (!needed) return true;
    const result = await authenticate({ message: t(AUTH_PROMPT_MESSAGE), cancelLabel: t("Cancel") });
    return authAllows(result.status);
  }, [hasData, lockEnabled, timeoutSec, t]);
}
