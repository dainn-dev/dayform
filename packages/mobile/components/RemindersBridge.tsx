import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import { useCycle } from "../lib/cycle-context";
import { useSpecialDays } from "../lib/special-days-context";
import type { SpecialDay } from "../lib/special-days";
import { useLanguage } from "../lib/language";
import { useTasks } from "../lib/tasks-context";
import { useSettings } from "../lib/settings-context";
import { CYCLE_ID_PREFIX, reconcileReminders, type ReminderLanguage } from "../lib/reminders";
import {
  createExpoScheduler,
  ensureCycleChannel,
  ensureReminderChannel,
  getReminderPermission,
  installReminderHandler,
} from "../lib/reminders-expo";
import {
  cycleGroupScheduler,
  planAllReminders,
  planCycleGroup,
  syncScope,
  type CycleSync,
  type NotificationSettings,
  type SyncScope,
} from "../lib/reminders-plan";
import type { Task } from "../lib/planner";

const DEBOUNCE_MS = 500;

/**
 * `scope` is `all` once the tasks and the settings are trustworthy; syncing earlier would cancel every reminder (or
 * schedule titles the user asked to hide). The period tracker has its own readiness: while it is loading or
 * unreadable its scheduled notifications are left alone (see `planAllReminders`). While the task store is unhealthy
 * but the tracker was read, the scope is `cycle`: only the tracker group is reconciled (see `syncScope`).
 */
type SyncInput = {
  tasks: Task[];
  language: ReminderLanguage;
  notifications: NotificationSettings;
  cycle: CycleSync;
  /** Undefined while the special days are loading or unreadable: their notifications are then left alone. */
  specialDays: readonly SpecialDay[] | undefined;
  settingsReady: boolean;
  scope: SyncScope;
};

/** Only the `dayform:cycle:*` group: cancels it when the tracker is off, paused or empty, whatever the task store says. */
async function syncCycleGroup({ language, notifications, cycle, settingsReady }: SyncInput): Promise<string[]> {
  const { planned, keepCycle } = planCycleGroup({ language, notifications, cycle, settingsReady, now: new Date() });
  if (planned.length > 0) await ensureCycleChannel(language);
  return (await reconcileReminders(cycleGroupScheduler(createExpoScheduler()), planned, undefined, { keepCycle })).errors;
}

async function syncReminders(input: SyncInput): Promise<string[]> {
  const { tasks, language, notifications, cycle, specialDays } = input;
  // Never prompts: the editor asks for permission when the user first picks a reminder.
  if ((await getReminderPermission()) !== "granted") return [];
  if (input.scope === "cycle") return syncCycleGroup(input);
  await ensureReminderChannel(language);
  const { planned, keepCycle, keepSpecial } = planAllReminders({ tasks, language, notifications, cycle, specialDays, now: new Date() });
  if (planned.some((reminder) => reminder.id.startsWith(CYCLE_ID_PREFIX))) await ensureCycleChannel(language);
  // Snoozed notifications of deleted or finished tasks must not fire either.
  const liveTaskIds = new Set(tasks.filter((task) => task.status !== "done").map((task) => task.id));
  return (await reconcileReminders(createExpoScheduler(), planned, liveTaskIds, { keepCycle, keepSpecial })).errors;
}

function warnInDev(message: string): void {
  if (__DEV__) console.warn(message);
}

type Syncer = { schedule(): void; dispose(): void };

/** Debounced, single-flight sync that always reads the freshest input through `read`. */
function createSyncer(read: () => SyncInput): Syncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let again = false;
  let disposed = false;

  const run = async (): Promise<void> => {
    if (disposed) return;
    if (running) { again = true; return; }
    const input = read();
    if (input.scope === "none") return;
    running = true;
    try {
      const errors = await syncReminders(input);
      if (errors.length) warnInDev(`Reminder sync had ${errors.length} error(s): ${errors[0]}`);
    } catch (error) {
      warnInDev(`Reminder sync failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
      if (again) { again = false; void run(); }
    }
  };

  return {
    schedule() {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void run(); }, DEBOUNCE_MS);
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Keeps scheduled local notifications in line with the tasks. Renders nothing. It never syncs the task reminders
 * while the tasks or settings are loading or writes are blocked (locked/read-only): the list is then empty or
 * partial, and reconciling against it would cancel the user's reminders. Settings changes re-sync. Switching the
 * period tracker off, pausing it or deleting its data cancels every `dayform:cycle:*` notification, also while the
 * task store is unhealthy (that group does not depend on it).
 */
export function RemindersBridge(): null {
  const { tasks, loading, writesBlocked } = useTasks();
  const { language } = useLanguage();
  const { settings, ready: settingsReady } = useSettings();
  const { notifications } = settings;
  const { state: cycleState, ready: cycleReady, locked: cycleLocked } = useCycle();
  const cycle = useMemo<CycleSync>(
    () => ({ state: cycleState, ready: cycleReady, locked: cycleLocked }),
    [cycleState, cycleReady, cycleLocked],
  );
  const { items: specialItems, ready: specialReady, locked: specialLocked } = useSpecialDays();
  const specialDays = specialReady && !specialLocked ? specialItems : undefined;
  const scope = syncScope({ tasksReady: !loading && !writesBlocked, settingsReady, cycle });
  const latest = useRef<SyncInput>({ tasks, language, notifications, cycle, specialDays, settingsReady, scope });
  const syncer = useRef<Syncer | null>(null);

  useLayoutEffect(() => {
    latest.current = { tasks, language, notifications, cycle, specialDays, settingsReady, scope };
  }, [tasks, language, notifications, cycle, specialDays, settingsReady, scope]);

  // Mount-only: handler, syncer and the foreground subscription stay stable across task changes.
  useEffect(() => {
    installReminderHandler();
    const created = createSyncer(() => latest.current);
    syncer.current = created;
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") created.schedule();
    });
    return () => {
      subscription.remove();
      created.dispose();
      syncer.current = null;
    };
  }, []);

  useEffect(() => {
    if (scope !== "none") syncer.current?.schedule();
  }, [tasks, language, notifications, cycle, specialDays, settingsReady, scope]);

  return null;
}
