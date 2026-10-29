import { useEffect, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import { useLanguage } from "../lib/language";
import { useTasks } from "../lib/tasks-context";
import {
  createActionQueue,
  dedupeKey,
  parseResponse,
  runAction,
  type ActionOutcome,
  type ActionQueue,
} from "../lib/notification-actions";
import { createExpoScheduler, registerReminderCategory } from "../lib/reminders-expo";
import type { ReminderLanguage } from "../lib/reminders";
import type { Task } from "../lib/planner";

type Response = Notifications.NotificationResponse;
type TasksMutate = ReturnType<typeof useTasks>["mutate"];
/** `ready` is false until the tasks are loaded and the router can navigate. */
type Context = {
  tasks: Task[];
  language: ReminderLanguage;
  mutate: TasksMutate;
  ready: boolean;
  writesBlocked: boolean;
};

const isWeb = Platform.OS === "web";

function warnInDev(message: string, error?: unknown): void {
  if (!__DEV__) return;
  console.warn(error === undefined ? message : `${message}: ${error instanceof Error ? error.message : String(error)}`);
}

/** Acts on one response. Only the validated task id from parseResponse is ever used. */
function handleResponse(response: Response, read: () => Context): Promise<ActionOutcome> {
  const action = parseResponse({
    actionIdentifier: response.actionIdentifier,
    data: response.notification.request.content.data,
  });
  const context = read();
  return runAction(action, {
    tasks: context.tasks,
    language: context.language,
    writesBlocked: () => read().writesBlocked,
    mutate: context.mutate,
    schedule: (reminder) => createExpoScheduler().schedule(reminder),
    open: (taskId) => router.navigate({ pathname: "/", params: { edit: taskId } }),
    warn: warnInDev,
    now: () => new Date(),
  });
}

function createResponseQueue(read: () => Context): ActionQueue<Response> {
  return createActionQueue<Response>({
    ready: () => read().ready,
    keyOf: dedupeKey,
    handle: (response) => handleResponse(response, read),
    // A handled response must not be replayed on the next launch or remount.
    onIdle: () => Notifications.clearLastNotificationResponse(),
    onError: (error) => warnInDev("Notification action failed", error),
  });
}

/**
 * Registers the reminder buttons ("Done", "Snooze") and acts on notification taps and button presses,
 * both while the app runs and for the response that launched it. Renders nothing. Needs TasksProvider.
 */
export function NotificationActions(): null {
  const { tasks, loading, mutate, writesBlocked } = useTasks();
  const { language } = useLanguage();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const ready = !loading && navigationReady;
  const latest = useRef<Context>({ tasks, language, mutate, ready, writesBlocked });
  const queue = useRef<ActionQueue<Response> | null>(null);

  useLayoutEffect(() => {
    latest.current = { tasks, language, mutate, ready, writesBlocked };
  }, [tasks, language, mutate, ready, writesBlocked]);

  useEffect(() => {
    if (isWeb) return;
    registerReminderCategory(language).catch((error: unknown) => warnInDev("Reminder category failed", error));
  }, [language]);

  // Mount-only: the subscription and the cold-start response are read once.
  useEffect(() => {
    if (isWeb) return;
    const created = createResponseQueue(() => latest.current);
    queue.current = created;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => created.push(response));
    const launch = Notifications.getLastNotificationResponse();
    if (launch) created.push(launch);
    return () => {
      subscription.remove();
      queue.current = null;
    };
  }, []);

  // A "Done" tap that arrived while writes were blocked is retried once they are allowed again.
  useEffect(() => {
    if (ready && !writesBlocked) void queue.current?.drain();
  }, [ready, writesBlocked]);

  return null;
}
