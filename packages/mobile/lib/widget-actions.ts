import { z } from "zod";
import type { Task } from "./planner";

/**
 * Ticks made on the home-screen widget. A tap on a row flips that task in the widget's own copy at once (so the
 * widget answers without the app) and queues the wish here; the app applies the queue to the real tasks the next time
 * it is in front, and only then tells the widget the wish is done. The widget never writes the task list itself.
 * Pure: the queue crosses the native module as JSON.
 */
export type WidgetToggle = {
  /** The task id from the snapshot's `i`. */
  id: string;
  /** What the user wanted: finished (true) or reopened (false). */
  done: boolean;
  /** When it was queued (epoch ms): the receipt the app hands back so only what it applied is removed. */
  at: number;
};

const MAX_TOGGLES = 200;
const MAX_ID_LENGTH = 100;

const toggleSchema = z.object({
  id: z.string().min(1).max(MAX_ID_LENGTH),
  done: z.boolean(),
  at: z.number().finite(),
});

/** Reads the queue the widget wrote; anything unreadable is skipped. */
export function parseWidgetToggles(json: string): WidgetToggle[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_TOGGLES).flatMap(item => {
    const parsed = toggleSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The receipt for `applied`: a JSON list of their `at`. */
export function toggleReceipt(applied: readonly WidgetToggle[]): string {
  return JSON.stringify(applied.map(toggle => toggle.at));
}

/**
 * The update that applies the wishes to the stored list. Only the last wish per task counts. A task that is gone is
 * skipped; one that already is in the wished state is left untouched (the same array comes back when nothing changed).
 */
export function applyWidgetToggles(toggles: readonly WidgetToggle[]): (tasks: Task[]) => Task[] {
  const wanted = new Map<string, boolean>();
  for (const toggle of [...toggles].sort((a, b) => a.at - b.at)) wanted.set(toggle.id, toggle.done);
  return tasks => {
    let changed = false;
    const next = tasks.map(task => {
      const done = wanted.get(task.id);
      if (done === undefined || (task.status === "done") === done) return task;
      changed = true;
      return { ...task, status: done ? "done" as const : "todo" as const };
    });
    return changed ? next : tasks;
  };
}
