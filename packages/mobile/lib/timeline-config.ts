import { formatTime, minutes, type Task, type TimeFormat } from "./planner";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

// Pure timeline geometry derived from the Calendar settings. Framework-free so it can be tested.

/** Minimum rendered height of an event block, in px. */
export const MIN_EVENT_PX = 38;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const MIN_WINDOW_SPAN = 240;
/** Space below the last hour line, in px (room for the hour label). */
const TIMELINE_PADDING_PX = 16;
/** Height of a tappable hour slot, in minutes (one pixel row short of the hour so slots do not touch). */
const SLOT_MINUTES = 59;
/** The empty-state box sits this far from the top (px) when the timeline is tall enough. */
const EMPTY_TOP_PX = 65;
const EMPTY_TOP_MIN_PX = 8;
/** Rough height of the empty-state box (px), used to keep it inside short timelines. */
const EMPTY_BOX_PX = 130;

type Calendar = Settings["calendar"];
/** The only calendar settings that shape the timeline. */
export type TimelineSettings = Pick<Calendar, "dayStart" | "dayEnd" | "hourHeight">;

/** Pixels per minute for each "hour height" setting (normal = 64px per hour). */
const SCALES: Record<Calendar["hourHeight"], number> = { compact: 0.8, normal: 1.07, roomy: 1.4 };

export interface TimelineConfig {
  /** First and last visible minute of the day (whole hours). */
  readonly startMin: number;
  readonly endMin: number;
  /** Pixels per minute. */
  readonly scale: number;
  /** Hour labels from the first to the last hour of the window, inclusive. */
  readonly hours: readonly number[];
  /** Tappable hour slots: every label hour except the last. */
  readonly slotHours: readonly number[];
  readonly firstHour: number;
  /** Total timeline height in px. */
  readonly height: number;
  /** Height of one tappable hour slot in px. */
  readonly slotHeight: number;
  /** Minimum visual duration in minutes (the 38px minimum block height), used for lane assignment. */
  readonly minVisualMinutes: number;
  /** Top offset (px) of the empty-state box. */
  readonly emptyTop: number;
}

function isUsableWindow(start: number, end: number): boolean {
  const wholeHours = start % MINUTES_PER_HOUR === 0 && end % MINUTES_PER_HOUR === 0;
  return wholeHours && start >= 0 && end <= MINUTES_PER_DAY && end - start >= MIN_WINDOW_SPAN;
}

/** Builds the geometry for the Calendar settings; an unusable window falls back to the default one. */
export function makeTimelineConfig(calendar: TimelineSettings): TimelineConfig {
  const usable = isUsableWindow(calendar.dayStart, calendar.dayEnd);
  const startMin = usable ? calendar.dayStart : DEFAULT_SETTINGS.calendar.dayStart;
  const endMin = usable ? calendar.dayEnd : DEFAULT_SETTINGS.calendar.dayEnd;
  const scale = SCALES[calendar.hourHeight];
  const firstHour = startMin / MINUTES_PER_HOUR;
  const hours = Array.from({ length: (endMin - startMin) / MINUTES_PER_HOUR + 1 }, (_, i) => firstHour + i);
  const height = (endMin - startMin) * scale + TIMELINE_PADDING_PX;
  return {
    startMin,
    endMin,
    scale,
    hours,
    slotHours: hours.slice(0, -1),
    firstHour,
    height,
    slotHeight: SLOT_MINUTES * scale,
    minVisualMinutes: Math.ceil(MIN_EVENT_PX / scale),
    emptyTop: Math.min(EMPTY_TOP_PX, Math.max(EMPTY_TOP_MIN_PX, (height - EMPTY_BOX_PX) / 2)),
  };
}

export type EventGeometry = { top: number; height: number };

/** Scheduled tasks starting inside the visible window versus outside it (those go in the outside-hours list). */
export function partitionVisible(config: TimelineConfig, scheduled: readonly Task[]): { visible: Task[]; outside: Task[] } {
  const visible: Task[] = [];
  const outside: Task[] = [];
  for (const task of scheduled) {
    const start = minutes(task.start!);
    (start >= config.startMin && start < config.endMin ? visible : outside).push(task);
  }
  return { visible, outside };
}

/** Pixel position of a timeline block; the bottom is clamped to the end of the window. */
export function eventGeometry(config: TimelineConfig, task: Task): EventGeometry {
  const start = minutes(task.start!);
  const { scale } = config;
  const top = (start - config.startMin) * scale;
  const height = Math.max(MIN_EVENT_PX, Math.min(task.duration * scale - 3, (config.endMin - start) * scale - 3));
  return { top, height };
}

/** Y offset of the "now" line, or null when now is outside the visible window. */
export function nowOffset(config: TimelineConfig, now: Date): number | null {
  const current = now.getHours() * MINUTES_PER_HOUR + now.getMinutes();
  return current >= config.startMin && current <= config.endMin ? (current - config.startMin) * config.scale : null;
}

/** The stored HH:mm value of an hour slot (never format-dependent). */
export function slotTime(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Hour gutter label: "06:00" in 24-hour format, "6 AM" in 12-hour format (hour 24 is midnight). */
export function hourLabel(hour: number, format: TimeFormat): string {
  if (format === "24h") return slotTime(hour);
  return formatTime(slotTime(hour % 24), "12h").replace(":00 ", " ");
}

/** "6 AM – 10 PM" / "06:00 – 22:00": the visible window in the chosen format. */
export function windowLabel(config: TimelineConfig, format: TimeFormat): string {
  const [first, last] = [config.startMin / MINUTES_PER_HOUR, config.endMin / MINUTES_PER_HOUR];
  return `${hourLabel(first, format)} – ${hourLabel(last, format)}`;
}
