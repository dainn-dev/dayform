import { reminderOptions } from "../../lib/planner";
import { fillPlaceholder, reminderLabelKey } from "../../lib/reminder-label";
import type { Choice } from "./ChoiceChips";

/** Translated label of one lead time ("15 min before", "At start time" ...). */
export function reminderLabel(minutesBefore: number, translate: (text: string) => string): string {
  const { key, n } = reminderLabelKey(minutesBefore);
  return fillPlaceholder(translate(key), n);
}

/** "No reminder" plus the presets, and `current` when it is a custom value (so it stays visible). */
export function reminderChoices(current: number | null, translate: (text: string) => string): Choice<number | null>[] {
  const minutesList: number[] = [...reminderOptions];
  if (current !== null && !minutesList.includes(current)) minutesList.push(current);
  minutesList.sort((a, b) => a - b);
  return [{ value: null, label: translate("No reminder") }, ...minutesList.map(value => ({ value, label: reminderLabel(value, translate) }))];
}
