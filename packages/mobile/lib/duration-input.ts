/** The unit the duration field is shown and typed in. Tasks are always stored in whole minutes. */
export type DurationUnit = "min" | "hr";

const MINUTES_PER_HOUR = 60;
const HOUR_DECIMALS = 2;

export function toggleUnit(unit: DurationUnit): DurationUnit {
  return unit === "min" ? "hr" : "min";
}

/** Parses a typed number, accepting a comma as the decimal separator. Null when it is not a number. */
function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** "90" -> "1.5". Text that is not a number is returned as typed so validation can report it. */
export function minutesToHoursText(minutesText: string): string {
  const minutes = parseNumber(minutesText);
  if (minutes === null) return minutesText;
  const hours = minutes / MINUTES_PER_HOUR;
  return String(Number(hours.toFixed(HOUR_DECIMALS)));
}

/** "1.5" -> "90" (whole minutes). Text that is not a number is returned as typed so validation can report it. */
export function hoursTextToMinutesText(hoursText: string): string {
  const hours = parseNumber(hoursText);
  if (hours === null) return hoursText;
  return String(Math.round(hours * MINUTES_PER_HOUR));
}
