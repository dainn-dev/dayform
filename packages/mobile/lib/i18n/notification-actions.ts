/** Vietnamese strings for the notification action buttons. The English text is the key. */
export const vi: Record<string, string> = {
  "Snooze 5 min": "Báo lại 5 phút",
  "Snooze 10 min": "Báo lại 10 phút",
  "Snooze 15 min": "Báo lại 15 phút",
};

/**
 * The "Done" button needs its own Vietnamese text: the shared "Done" key already means the task status
 * ("Đã xong"), and a button must read as an action. Used by actionLabels, never merged into the dictionary.
 */
export const DONE_ACTION_VI = "Xong";
/** Body prefix of a snoozed notification, in Vietnamese ("Reminder" is the English one). */
export const SNOOZED_BODY_VI = "Nhắc lại";
