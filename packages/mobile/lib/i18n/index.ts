import { vi as backup } from "./backup";
import { vi as carryOver } from "./carry-over";
import { vi as gestures } from "./gestures";
import { vi as pickers } from "./pickers";
import { vi as recurrence } from "./recurrence";
import { vi as reminders } from "./reminders";
import { vi as slogans } from "./slogans";
import { vi as store } from "./store";
import { vi as theme } from "./theme";
import { vi as undo } from "./undo";

/**
 * Vietnamese strings for features that keep their own dictionary file. The English text is the key.
 * Merged into the base dictionary in lib/language.tsx; add a new feature file here to register it.
 */
export const extraTranslations: Record<string, string> = {
  ...backup,
  ...carryOver,
  ...gestures,
  ...pickers,
  ...recurrence,
  ...reminders,
  ...slogans,
  ...store,
  ...theme,
  ...undo,
};
