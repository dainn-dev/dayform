import { vi as archive } from "./archive";
import { vi as backup } from "./backup";
import { vi as carryOver } from "./carry-over";
import { vi as errors } from "./errors";
import { vi as gestures } from "./gestures";
import { vi as notificationActions } from "./notification-actions";
import { vi as pickers } from "./pickers";
import { vi as recovery } from "./recovery";
import { vi as recurrence } from "./recurrence";
import { vi as reminders } from "./reminders";
import { vi as search } from "./search";
import { vi as slogans } from "./slogans";
import { vi as stats } from "./stats";
import { vi as store } from "./store";
import { vi as theme } from "./theme";
import { vi as undo } from "./undo";
import { vi as update } from "./update";

/**
 * Vietnamese strings for features that keep their own dictionary file. The English text is the key.
 * Merged into the base dictionary in lib/language.tsx; add a new feature file here to register it.
 */
export const extraTranslations: Record<string, string> = {
  ...archive,
  ...backup,
  ...carryOver,
  ...errors,
  ...gestures,
  ...notificationActions,
  ...pickers,
  ...recovery,
  ...recurrence,
  ...reminders,
  ...search,
  ...slogans,
  ...stats,
  ...store,
  ...theme,
  ...undo,
  ...update,
};
