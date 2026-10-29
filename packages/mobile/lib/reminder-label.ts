/**
 * Translation keys for reminder lead times. Presets keep their fixed keys; custom values use a
 * key with an `{n}` placeholder so the Vietnamese word order ("Trước {n} phút") can differ.
 */

const MINUTES_PER_HOUR = 60;

export type ReminderLabel = { key: string; n?: number };

export function reminderLabelKey(minutesBefore: number): ReminderLabel {
  if (minutesBefore === 0) return { key: "At start time" };
  if (minutesBefore === MINUTES_PER_HOUR) return { key: "1 hour before" };
  if (minutesBefore % MINUTES_PER_HOUR === 0) return { key: "{n} hours before", n: minutesBefore / MINUTES_PER_HOUR };
  if ([5, 15, 30].includes(minutesBefore)) return { key: `${minutesBefore} min before` };
  return { key: "{n} min before", n: minutesBefore };
}

/** Fills the `{n}` placeholder of an already translated string. */
export function fillPlaceholder(text: string, n: number | undefined): string {
  return n === undefined ? text : text.replace("{n}", String(n));
}
