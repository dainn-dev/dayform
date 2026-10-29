/** Timeline geometry. Spec: 06:00-22:00, 64px/hour (SCALE px per minute), see design.md. */
export const START = 6 * 60;
export const END = 22 * 60;
export const SCALE = 1.07;
/** Minimum rendered height of an event block, in px. */
export const MIN_EVENT_PX = 38;
/** Minimum visual duration in minutes, used for lane assignment. */
export const MIN_VISUAL_MINUTES = Math.ceil(MIN_EVENT_PX / SCALE);

/** Hour labels run 06:00..22:00 inclusive; clickable hour slots run 06:00..21:00. */
export const FIRST_HOUR = START / 60;
export const HOURS = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => FIRST_HOUR + i);
export const SLOT_HOURS = HOURS.slice(0, -1);

/** Left gutter (px) reserved for hour labels. */
export const GUTTER = 48;
export const TIMELINE_HEIGHT = (END - START) * SCALE + 16;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAYS_VI = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
