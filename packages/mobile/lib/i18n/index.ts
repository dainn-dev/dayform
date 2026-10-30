import { vi as archive } from "./archive";
import { vi as assistant } from "./assistant";
import { vi as backup } from "./backup";
import { vi as calendar } from "./calendar";
import { vi as carryOver } from "./carry-over";
import { vi as categories } from "./categories";
import { vi as categoriesUi } from "./categories-ui";
import { vi as categoryUsage } from "./category-usage";
import { vi as cycleNotify } from "./cycle-notify";
import { vi as cyclePrivacy } from "./cycle-privacy";
import { vi as cycleUi } from "./cycle-ui";
import { vi as errors } from "./errors";
import { vi as exploreScheduled } from "./explore-paging";
import { vi as gestures } from "./gestures";
import { vi as greeting } from "./greeting";
import { vi as habits } from "./habits";
import { vi as habitsUi } from "./habits-ui";
import { vi as newTask } from "./new-task";
import { vi as notificationActions } from "./notification-actions";
import { vi as notifications } from "./notifications";
import { vi as ota } from "./ota";
import { vi as personal } from "./personal";
import { vi as pet } from "./pet";
import { vi as pickers } from "./pickers";
import { vi as recovery } from "./recovery";
import { vi as recurrence } from "./recurrence";
import { vi as reminders } from "./reminders";
import { vi as search } from "./search";
import { vi as settingsMenu } from "./settings-menu";
import { vi as slogans } from "./slogans";
import { vi as specialDays } from "./special-days";
import { vi as stats } from "./stats";
import { vi as store } from "./store";
import { vi as theme } from "./theme";
import { vi as undo } from "./undo";
import { vi as update } from "./update";
import { vi as widget } from "./widget";

/**
 * Vietnamese strings for features that keep their own dictionary file. The English text is the key.
 * Merged into the base dictionary in lib/language.tsx; add a new feature file here to register it.
 */
export const extraTranslations: Record<string, string> = {
  ...archive,
  ...assistant,
  ...backup,
  ...calendar,
  ...carryOver,
  ...categories,
  ...categoriesUi,
  ...categoryUsage,
  ...cycleNotify,
  ...cyclePrivacy,
  ...cycleUi,
  ...errors,
  ...exploreScheduled,
  ...gestures,
  ...greeting,
  ...habits,
  ...habitsUi,
  ...newTask,
  ...notificationActions,
  ...notifications,
  ...ota,
  ...personal,
  ...pet,
  ...pickers,
  ...recovery,
  ...recurrence,
  ...reminders,
  ...search,
  ...settingsMenu,
  ...slogans,
  ...specialDays,
  ...stats,
  ...store,
  ...theme,
  ...undo,
  ...update,
  ...widget,
};
