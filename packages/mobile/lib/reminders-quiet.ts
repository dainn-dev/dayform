/** A daily "do not disturb" window in local wall-clock time. It may cross midnight (22:00 to 07:00). */
export type QuietWindow = { from: string; to: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTES_PER_HOUR = 60;

function minutesOf(time: string): number | null {
  const match = TIME_PATTERN.exec(time);
  return match ? Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]) : null;
}

/** Window bounds as minutes of day, or null when there is no usable window (missing, malformed or from === to). */
export function quietWindowMinutes(quiet: QuietWindow | null | undefined): { from: number; to: number } | null {
  if (!quiet) return null;
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  return from === null || to === null || from === to ? null : { from, to };
}

/**
 * `fireAt` itself when it is outside the quiet window (start inclusive, end exclusive), otherwise the end of the
 * window on the right calendar day. Built from local wall-clock fields, so DST changes cannot shift it.
 */
export function postponeOutOfQuiet(fireAt: Date, quiet: QuietWindow | null | undefined): Date {
  const window = quietWindowMinutes(quiet);
  if (!window) return fireAt;
  const minute = fireAt.getHours() * MINUTES_PER_HOUR + fireAt.getMinutes();
  const crossesMidnight = window.from > window.to;
  const inWindow = crossesMidnight ? minute >= window.from || minute < window.to : minute >= window.from && minute < window.to;
  if (!inWindow) return fireAt;
  const nextDay = crossesMidnight && minute >= window.from ? 1 : 0;
  return new Date(
    fireAt.getFullYear(), fireAt.getMonth(), fireAt.getDate() + nextDay,
    Math.floor(window.to / MINUTES_PER_HOUR), window.to % MINUTES_PER_HOUR,
  );
}
