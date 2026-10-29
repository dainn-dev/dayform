import { useState } from "react";
import { useLanguage } from "../../lib/language";
import { ensureReminderChannel, requestReminderPermission } from "../../lib/reminders-expo";

export const PERMISSION_HINT = "Notifications are turned off. Turn them on in system settings to get reminders.";

/**
 * The notification permission flow behind picking a reminder: channel first, then the permission prompt.
 * A refusal (or an error) never undoes the choice; it only raises `denied` so the caller can show the hint.
 */
export function useReminderPermission() {
  const { language } = useLanguage();
  const [denied, setDenied] = useState(false);

  /** Call after a lead time was picked; `null` (no reminder) clears the hint without asking. */
  const request = async (next: number | null): Promise<void> => {
    if (next === null) return setDenied(false);
    try {
      await ensureReminderChannel(language);
      setDenied((await requestReminderPermission()) !== "granted");
    } catch {
      setDenied(true);
    }
  };
  return { denied, request };
}
