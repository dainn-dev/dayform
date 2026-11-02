import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { REMINDER_CHANNEL_ID } from "./reminders-expo";

/**
 * The one notification of a running focus phase: it fires when the phase ends, so the user is told even with the app
 * closed. Its id starts with `dayform:focus:`, which the reminder sync never owns, so it is never cancelled by it.
 * It carries no task title and no data: a tap only opens the app. Expo glue, not unit-tested.
 */
export const FOCUS_NOTIFICATION_ID = "dayform:focus:end";

export async function scheduleFocusEnd(at: Date, title: string, body: string): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.scheduleNotificationAsync({
    identifier: FOCUS_NOTIFICATION_ID,
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: REMINDER_CHANNEL_ID },
  });
}

export async function cancelFocusEnd(): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.cancelScheduledNotificationAsync(FOCUS_NOTIFICATION_ID);
}
