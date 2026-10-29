import { describe, test, expect } from "bun:test";
import {
  actionLabels,
  buildSnoozeReminder,
  dedupeKey,
  findEditTarget,
  markDoneUpdate,
  parseResponse,
  rememberHandled,
  snoozeFireAt,
  snoozeId,
  snoozeMessage,
  type RawResponse,
} from "./notification-actions";
import { REMINDER_ID_PREFIX } from "./reminders";
import type { Task } from "./planner";

const DEFAULT_ACTION = "expo.modules.notifications.actions.DEFAULT";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Deep work",
    date: "2026-10-30",
    start: "09:30",
    duration: 60,
    status: "todo",
    category: "Focus",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    remind: 15,
    ...overrides,
  };
}

function makeRaw(overrides: Partial<{ actionIdentifier: string; identifier: string; date: number; data: Record<string, unknown> | undefined }> = {}): RawResponse {
  const { actionIdentifier = "done", identifier = "dayform:task:t1:abc", date = 1_000, data = { taskId: "t1" } } = overrides;
  return { actionIdentifier, notification: { date, request: { identifier, content: { data } } } };
}

describe("parseResponse", () => {
  test("the default (tap) action opens the task", () => {
    expect(parseResponse({ actionIdentifier: DEFAULT_ACTION, data: { taskId: "t1" } })).toEqual({ kind: "open", taskId: "t1" });
  });
  test("done and snooze actions map to their kinds", () => {
    expect(parseResponse({ actionIdentifier: "done", data: { taskId: "t1" } })).toEqual({ kind: "done", taskId: "t1" });
    expect(parseResponse({ actionIdentifier: "snooze", data: { taskId: "t1" } })).toEqual({ kind: "snooze", taskId: "t1" });
  });
  test("unknown actions (dismiss, text input, junk) are ignored", () => {
    expect(parseResponse({ actionIdentifier: "expo.modules.notifications.actions.DISMISSED", data: { taskId: "t1" } })).toEqual({ kind: "ignore" });
    expect(parseResponse({ actionIdentifier: "", data: { taskId: "t1" } })).toEqual({ kind: "ignore" });
    expect(parseResponse({ actionIdentifier: "DONE", data: { taskId: "t1" } })).toEqual({ kind: "ignore" });
  });
  test("a missing or non-object data is ignored", () => {
    expect(parseResponse({ actionIdentifier: "done", data: undefined })).toEqual({ kind: "ignore" });
    expect(parseResponse({ actionIdentifier: "done", data: null })).toEqual({ kind: "ignore" });
    expect(parseResponse({ actionIdentifier: "done", data: "t1" })).toEqual({ kind: "ignore" });
    expect(parseResponse({ actionIdentifier: "done", data: ["t1"] })).toEqual({ kind: "ignore" });
  });
  test("taskId must be a non-empty, non-blank string of sane length", () => {
    for (const taskId of [undefined, null, 5, {}, [], "", "   ", "x".repeat(201)]) {
      expect(parseResponse({ actionIdentifier: "done", data: { taskId } })).toEqual({ kind: "ignore" });
    }
    expect(parseResponse({ actionIdentifier: "done", data: { taskId: "x".repeat(200) } })).toEqual({ kind: "done", taskId: "x".repeat(200) });
  });
  test("an unsafe actionIdentifier type is ignored", () => {
    expect(parseResponse({ actionIdentifier: 5 as unknown as string, data: { taskId: "t1" } })).toEqual({ kind: "ignore" });
  });
  test("trusts nothing but taskId: urls, paths and params are dropped", () => {
    const parsed = parseResponse({
      actionIdentifier: DEFAULT_ACTION,
      data: { taskId: "t1", url: "https://evil.example", pathname: "/admin", params: { a: 1 }, edit: "other" },
    });
    expect(parsed).toEqual({ kind: "open", taskId: "t1" });
    expect(Object.keys(parsed)).toEqual(["kind", "taskId"]);
  });
});

describe("snooze helpers", () => {
  test("snoozeFireAt adds ten minutes by default and does not mutate", () => {
    const now = new Date(2026, 9, 30, 8, 55);
    const fireAt = snoozeFireAt(now);
    expect(fireAt.getTime() - now.getTime()).toBe(10 * 60_000);
    expect(now.getTime()).toBe(new Date(2026, 9, 30, 8, 55).getTime());
    expect(fireAt).not.toBe(now);
  });
  test("snoozeFireAt takes custom minutes", () => {
    const now = new Date(2026, 9, 30, 8, 0);
    expect(snoozeFireAt(now, 5).getTime() - now.getTime()).toBe(5 * 60_000);
  });
  test("snoozeId never collides with the reconciled reminder prefix", () => {
    const fireAt = new Date(2026, 9, 30, 8, 10);
    const id = snoozeId("t1", fireAt);
    expect(id).toBe(`dayform:snooze:t1:${fireAt.getTime()}`);
    expect(id.startsWith(REMINDER_ID_PREFIX)).toBe(false);
  });
  test("snoozeMessage keeps the user title and localizes the rest", () => {
    expect(snoozeMessage(makeTask(), "en")).toEqual({ title: "Deep work", body: "Reminder · 09:30" });
    expect(snoozeMessage(makeTask(), "vi")).toEqual({ title: "Deep work", body: "Nhắc lại · 09:30" });
    expect(snoozeMessage(makeTask({ start: null }), "en").body).toBe("Reminder");
  });
  test("buildSnoozeReminder builds a one-off reminder for the task", () => {
    const now = new Date(2026, 9, 30, 8, 0);
    const reminder = buildSnoozeReminder(makeTask(), now, "en");
    expect(reminder.taskId).toBe("t1");
    expect(reminder.fireAt.getTime()).toBe(now.getTime() + 10 * 60_000);
    expect(reminder.id).toBe(snoozeId("t1", reminder.fireAt));
    expect(reminder.title).toBe("Deep work");
    expect(reminder.body).toBe("Reminder · 09:30");
  });
});

describe("dedupeKey and rememberHandled", () => {
  test("the same response gives the same key, different ones differ", () => {
    expect(dedupeKey(makeRaw())).toBe(dedupeKey(makeRaw()));
    expect(dedupeKey(makeRaw())).not.toBe(dedupeKey(makeRaw({ actionIdentifier: "snooze" })));
    expect(dedupeKey(makeRaw())).not.toBe(dedupeKey(makeRaw({ date: 2_000 })));
    expect(dedupeKey(makeRaw())).not.toBe(dedupeKey(makeRaw({ identifier: "other" })));
  });
  test("rememberHandled reports first sight only and does not mutate", () => {
    const first = rememberHandled([], "a");
    expect(first).toEqual({ fresh: true, keys: ["a"] });
    const second = rememberHandled(first.keys, "a");
    expect(second.fresh).toBe(false);
    expect(second.keys).toEqual(["a"]);
    expect(first.keys).toEqual(["a"]);
  });
  test("rememberHandled keeps a bounded history, dropping the oldest", () => {
    let keys: string[] = [];
    for (let i = 0; i < 80; i++) keys = rememberHandled(keys, `k${i}`).keys;
    expect(keys.length).toBe(50);
    expect(keys[0]).toBe("k30");
    expect(keys[49]).toBe("k79");
  });
});

describe("markDoneUpdate", () => {
  test("marks only the named task done, immutably", () => {
    const list = [makeTask({ id: "a" }), makeTask({ id: "b" })];
    const next = markDoneUpdate("a")(list);
    expect(next.map((t) => t.status)).toEqual(["done", "todo"]);
    expect(list[0]!.status).toBe("todo");
    expect(next[1]).toBe(list[1]);
  });
  test("returns the same list for a missing task (no pointless write)", () => {
    const list = [makeTask({ id: "a" })];
    expect(markDoneUpdate("zzz")(list)).toBe(list);
  });
  test("returns the same list when the task is already done", () => {
    const list = [makeTask({ id: "a", status: "done" })];
    expect(markDoneUpdate("a")(list)).toBe(list);
  });
});

describe("findEditTarget", () => {
  const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];
  test("returns the task a valid param names", () => {
    expect(findEditTarget(tasks, "b")?.id).toBe("b");
  });
  test("returns null for unknown ids and non-string params", () => {
    expect(findEditTarget(tasks, "zzz")).toBeNull();
    expect(findEditTarget(tasks, undefined)).toBeNull();
    expect(findEditTarget(tasks, ["a"])).toBeNull();
    expect(findEditTarget(tasks, "")).toBeNull();
    expect(findEditTarget(tasks, "x".repeat(500))).toBeNull();
  });
});

describe("actionLabels", () => {
  test("english and vietnamese button titles", () => {
    expect(actionLabels("en")).toEqual({ done: "Done", snooze: "Snooze 10 min" });
    expect(actionLabels("vi")).toEqual({ done: "Xong", snooze: "Báo lại 10 phút" });
  });
});
