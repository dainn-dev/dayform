import { useEffect, useRef } from "react";
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

type SyncInput = { tasks: Task[]; language: ReminderLanguage };

async function syncReminders({ tasks, language }: SyncInput): Promise<string[]> {
  // Never prompts: the editor asks for permission when the user first picks a reminder.
  if ((await getReminderPermission()) !== "granted") return [];
  await ensureReminderChannel(language);
  const planned = planReminders(tasks, new Date(), { language });
  return (await reconcileReminders(createExpoScheduler(), planned)).errors;
}

/** Keeps scheduled local notifications in line with the tasks. Renders nothing. */
export function RemindersBridge(): null {
  const { tasks, loading } = useTasks();
  const { language } = useLanguage();
  const latest = useRef<SyncInput>({ tasks, language });
  latest.current = { tasks, language };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    installReminderHandler();
    const run = async (): Promise<void> => {
      if (running.current) { again.current = true; return; }
      running.current = true;
      try {
        const errors = await syncReminders(latest.current);
        if (__DEV__ && errors.length) console.warn(`Reminder sync had ${errors.length} error(s): ${errors[0]}`);
      } catch (error) {
        if (__DEV__) console.warn(`Reminder sync failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        running.current = false;
        if (again.current) { again.current = false; void run(); }
      }
    };
    const schedule = (): void => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = null; void run(); }, DEBOUNCE_MS);
    };
    if (!loading) schedule();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && !loading) schedule();
    });
    return () => {
      subscription.remove();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [tasks, language, loading]);

  return null;
}
