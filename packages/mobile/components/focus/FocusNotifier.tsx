import { useEffect } from "react";
import { cancelFocusEnd, scheduleFocusEnd } from "../../lib/focus-notify-expo";
import { endsAt } from "../../lib/focus";
import { useFocus } from "../../lib/focus-context";
import { useLanguage } from "../../lib/language";
import { ensureReminderChannel, getReminderPermission } from "../../lib/reminders-expo";

/**
 * Keeps one notification armed for the end of the running focus phase and drops it when the session is paused,
 * stopped or over. It never asks for the notification permission (the focus sheet does, when the user starts a
 * round) and it fails quietly: the countdown on screen works without it. Renders nothing.
 */
export function FocusNotifier(): null {
  const { session } = useFocus();
  const { t, language } = useLanguage();
  const phase = session?.phase ?? null;
  const running = session !== null && session.pausedAt === null;
  const end = session !== null && running ? endsAt(session) : null;

  useEffect(() => {
    let cancelled = false;
    const arm = async (): Promise<void> => {
      await cancelFocusEnd();
      if (end === null || phase === null || cancelled) return;
      if (end <= Date.now() || (await getReminderPermission()) !== "granted") return;
      await ensureReminderChannel(language);
      if (cancelled) return;
      const done = phase === "focus";
      await scheduleFocusEnd(new Date(end), t(done ? "Focus round done" : "Break is over"), t(done ? "Time to rest your eyes for a moment." : "Ready for another round?"));
    };
    void arm().catch(() => { /* The countdown on screen still works. */ });
    return () => { cancelled = true; };
  }, [end, phase, language, t]);

  return null;
}
