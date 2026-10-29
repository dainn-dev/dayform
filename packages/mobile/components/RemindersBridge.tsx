import { useEffect, useLayoutEffect, useRef } from "react";
import { AppState } from "react-native";
import { useLanguage } from "../lib/language";
import { useTasks } from "../lib/tasks-context";
import { planReminders, reconcileReminders, type ReminderLanguage } from "../lib/reminders";
import {
  createExpoScheduler,
  ensureReminderChannel,
  getReminderPermission,
  installReminderHandler,
} from "../lib/reminders-expo";
import type { Task } from "../lib/planner";

const DEBOUNCE_MS = 500;

/** `canSync` is false until the tasks are trustworthy; syncing earlier would cancel every reminder. */
type SyncInput = { tasks: Task[]; language: ReminderLanguage; canSync: boolean };

async function syncReminders({ tasks, language }: SyncInput): Promise<string[]> {
  // Never prompts: the editor asks for permission when the user first picks a reminder.
  if ((await getReminderPermission()) !== "granted") return [];
  await ensureReminderChannel(language);
  const planned = planReminders(tasks, new Date(), { language });
  return (await reconcileReminders(createExpoScheduler(), planned)).errors;
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
    if (!input.canSync) return;
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
 * Keeps scheduled local notifications in line with the tasks. Renders nothing. It never syncs while
 * the tasks are loading or writes are blocked (locked/read-only): the list is then empty or partial,
 * and reconciling against it would cancel the user's reminders.
 */
export function RemindersBridge(): null {
  const { tasks, loading, writesBlocked } = useTasks();
  const { language } = useLanguage();
  const canSync = !loading && !writesBlocked;
  const latest = useRef<SyncInput>({ tasks, language, canSync });
  const syncer = useRef<Syncer | null>(null);

  useLayoutEffect(() => {
    latest.current = { tasks, language, canSync };
  }, [tasks, language, canSync]);

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
    if (canSync) syncer.current?.schedule();
  }, [tasks, language, canSync]);

  return null;
}
