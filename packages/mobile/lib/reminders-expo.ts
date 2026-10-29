import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { PlannedReminder, ReminderLanguage, ReminderScheduler } from "./reminders";

export type ReminderPermission = "granted" | "denied" | "undetermined";

/** Android notification channel id used by every reminder. */
export const REMINDER_CHANNEL_ID = "reminders";

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
 * Creates (or updates) the Android channel. Call it before requesting permission:
 * on Android 13+ the permission prompt only appears once a channel exists.
 * Rejects with the native error if the channel cannot be created.
 */
export async function ensureReminderChannel(language: ReminderLanguage): Promise<void> {
  if (isWeb || Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: CHANNEL_NAMES[language],
    importance: Notifications.AndroidImportance.HIGH,
  });
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
        content: { title: reminder.title, body: reminder.body, data: { taskId: reminder.taskId } },
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
