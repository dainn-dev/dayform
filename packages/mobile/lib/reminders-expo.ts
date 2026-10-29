import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  actionLabels,
  DONE_ACTION_ID,
  REMINDER_CATEGORY_ID,
  SNOOZE_ACTION_ID,
  SNOOZE_MINUTES,
} from "./notification-actions";
import type { PlannedReminder, ReminderLanguage, ReminderScheduler } from "./reminders";

export type ReminderPermission = "granted" | "denied" | "undetermined";

/** Android notification channel id used by every reminder. */
export const REMINDER_CHANNEL_ID = "reminders-v2";
/** Earlier channel id: its lock-screen visibility cannot be changed once created, so it is replaced. */
export const LEGACY_REMINDER_CHANNEL_ID = "reminders";

const CHANNEL_NAMES: Record<ReminderLanguage, string> = { en: "Reminders", vi: "Nhắc nhở" };

const isWeb = Platform.OS === "web";

function toPermission(response: Notifications.NotificationPermissionsStatus): ReminderPermission {
  if (response.granted) return "granted";
  return String(response.status) === "undetermined" ? "undetermined" : "denied";
}

/** Show reminders as a banner (with sound) even while the app is open. Safe to call repeatedly. */
export function installReminderHandler(): void {
  if (isWeb) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Creates (or updates) the Android channel (lock-screen visibility PRIVATE, so task titles are hidden
 * there) and deletes the legacy public one. Call it before requesting permission:
 * on Android 13+ the permission prompt only appears once a channel exists.
 * Rejects with the native error if the channel cannot be created.
 */
export async function ensureReminderChannel(language: ReminderLanguage): Promise<void> {
  if (isWeb || Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: CHANNEL_NAMES[language],
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  await Notifications.deleteNotificationChannelAsync(LEGACY_REMINDER_CHANNEL_ID);
}

/**
 * Registers the category that gives reminders their "Done" and "Snooze" buttons. Both open the app:
 * on Android an action that opens no UI cannot run JS while the app is killed. Safe to call repeatedly
 * (it replaces the category, which is how a language or snooze-length change updates the button titles).
 */
export async function registerReminderCategory(
  language: ReminderLanguage,
  snoozeMinutes: number = SNOOZE_MINUTES,
): Promise<void> {
  if (isWeb) return;
  const labels = actionLabels(language, snoozeMinutes);
  const options = { opensAppToForeground: true };
  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY_ID, [
    { identifier: DONE_ACTION_ID, buttonTitle: labels.done, options },
    { identifier: SNOOZE_ACTION_ID, buttonTitle: labels.snooze, options },
  ]);
}

export async function getReminderPermission(): Promise<ReminderPermission> {
  if (isWeb) return "denied";
  return toPermission(await Notifications.getPermissionsAsync());
}

/** Shows the system prompt when the OS still allows it. Never call this from a background sync. */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (isWeb) return "denied";
  return toPermission(await Notifications.requestPermissionsAsync());
}

/**
 * Task reminders carry the task id (never the title) and the Done/Snooze category. Summaries are plain:
 * no data and no category, so a tap only opens the app.
 */
function contentFor(reminder: PlannedReminder): Notifications.NotificationContentInput {
  if (reminder.kind === "summary") return { title: reminder.title, body: reminder.body };
  return {
    title: reminder.title,
    body: reminder.body,
    data: { taskId: reminder.taskId },
    categoryIdentifier: REMINDER_CATEGORY_ID,
  };
}

export function createExpoScheduler(): ReminderScheduler {
  return {
    async listScheduledIds(): Promise<string[]> {
      if (isWeb) return [];
      const requests = await Notifications.getAllScheduledNotificationsAsync();
      return requests.map((request) => request.identifier);
    },
    async schedule(reminder: PlannedReminder): Promise<void> {
      if (isWeb) return;
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: contentFor(reminder),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.fireAt,
          channelId: REMINDER_CHANNEL_ID,
        },
      });
    },
    async cancel(ids: string[]): Promise<void> {
      if (isWeb) return;
      await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    },
  };
}
