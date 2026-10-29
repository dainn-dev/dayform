import { minutes, type Task } from "../../lib/planner";
import { END, SCALE, MIN_EVENT_PX, START } from "./constants";

export type EventGeometry = { top: number; height: number };

/** Scheduled tasks starting inside the visible window versus outside it. */
export function partitionVisible(scheduled: Task[]): { visible: Task[]; outside: Task[] } {
  const visible = scheduled.filter(t => minutes(t.start!) >= START && minutes(t.start!) < END);
  return { visible, outside: scheduled.filter(t => !visible.includes(t)) };
}

/** Pixel position of a timeline block; the bottom is clamped to the end of the window. */
export function eventGeometry(task: Task): EventGeometry {
  const start = minutes(task.start!);
  const top = (start - START) * SCALE;
  const height = Math.max(MIN_EVENT_PX, Math.min(task.duration * SCALE - 3, (END - start) * SCALE - 3));
  return { top, height };
}

/** Y offset of the "now" line, or null when now is outside the visible window. */
export function nowOffset(now: Date): number | null {
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= START && current <= END ? (current - START) * SCALE : null;
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
