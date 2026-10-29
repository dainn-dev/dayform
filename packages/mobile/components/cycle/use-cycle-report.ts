import { useCallback, useState } from "react";
import { failureText } from "../../lib/cycle-ui-actions";
import type { CycleActionResult } from "../../lib/cycle-store";
import { useLanguage } from "../../lib/language";

/**
 * Runs a tracker action and keeps the plain-language reason when it fails. `run` resolves true on success.
 * The message is already translated; `clear` hides it.
 */
export function useCycleReport() {
  const { t } = useLanguage();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: () => Promise<CycleActionResult>): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await action();
      setMessage(result.ok ? null : t(failureText(result.reason)));
      return result.ok;
    } finally {
      setBusy(false);
    }
  }, [t]);

  const clear = useCallback(() => setMessage(null), []);
  return { message, busy, run, clear };
}
