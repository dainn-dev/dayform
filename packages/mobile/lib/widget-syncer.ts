import type { Task } from "./planner";
import type { DayMark } from "./day-marks";
import type { PetKind } from "./settings";
import {
  buildWidgetSnapshot,
  snapshotsEqual,
  type WidgetLocale,
  type WidgetSnapshot,
} from "./widget-snapshot";

/** `canSync` is false until the tasks are trustworthy (loading, locked or read-only). */
export type WidgetSyncInput = {
  tasks: readonly Task[];
  showTitles: boolean;
  locale: WidgetLocale;
  pet: PetKind;
  petWalks: boolean;
  /** The holidays and special days of the given days; undefined leaves the widget without marks. */
  marksFor?: (keys: readonly string[]) => Record<string, DayMark[]>;
  canSync: boolean;
};
export type WidgetSyncerDeps = {
  /** Always returns the freshest input. */
  read: () => WidgetSyncInput;
  /** Hands the JSON to the native module; resolves false on failure, ideally never rejects. */
  send: (json: string) => Promise<boolean>;
  now?: () => Date;
  delayMs?: number;
};
export type WidgetSyncer = {
  /** Debounced. `force` resends even when nothing changed. */
  schedule(options?: { force?: boolean }): void;
  dispose(): void;
};

const DEFAULT_DELAY_MS = 800;

/** Debounced, single-flight widget sender that skips snapshots equal to the last one delivered. */
export function createWidgetSyncer(deps: WidgetSyncerDeps): WidgetSyncer {
  const { read, send, now = () => new Date(), delayMs = DEFAULT_DELAY_MS } = deps;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSent: WidgetSnapshot | null = null;
  let running = false;
  let again = false;
  let force = false;
  let disposed = false;

  const deliver = async (snapshot: WidgetSnapshot, json: string): Promise<void> => {
    try {
      if (await send(json)) lastSent = snapshot;
    } catch {
      // The sender is best effort: a failed delivery is simply retried on the next schedule.
      lastSent = null;
    }
  };

  const run = async (): Promise<void> => {
    if (disposed) return;
    if (running) {
      again = true;
      return;
    }
    const input = read();
    if (!input.canSync) return;
    const { snapshot, json } = buildWidgetSnapshot(input.tasks, {
      now: now(),
      showTitles: input.showTitles,
      locale: input.locale,
      pet: input.pet,
      petWalks: input.petWalks,
      marksFor: input.marksFor,
    });
    if (!force && snapshotsEqual(lastSent, snapshot)) return;
    force = false;
    running = true;
    await deliver(snapshot, json);
    running = false;
    if (again) {
      again = false;
      void run();
    }
  };

  return {
    schedule(options) {
      if (disposed) return;
      force = force || options?.force === true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
