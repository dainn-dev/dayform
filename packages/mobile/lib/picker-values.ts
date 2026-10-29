import { dateKey, fromKey } from "./planner";

/** Conversions between the editor's string values and the Date objects native pickers use (local time). */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Picker value for a 'YYYY-MM-DD' string; `fallback` when it is not a real date. */
export function dateToPicker(key: string, fallback: Date): Date {
  if (!DATE_PATTERN.test(key) || dateKey(fromKey(key)) !== key) return new Date(fallback);
  return fromKey(key);
}

/** Picker value for an 'HH:mm' string on the day of `fallback`; `fallback` itself when it is invalid. */
export function timeToPicker(time: string, fallback: Date): Date {
  const match = TIME_PATTERN.exec(time);
  if (!match) return new Date(fallback);
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), Number(match[1]), Number(match[2]));
}

export function pickerToDate(value: Date): string {
  return dateKey(value);
}

export function pickerToTime(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}
