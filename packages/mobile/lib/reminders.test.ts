import { describe, test, expect } from "bun:test";
import {
  planReminders,
  reconcileReminders,
  reminderMessage,
  type PlannedReminder,
  type ReminderScheduler,
} from "./reminders";
import type { Task } from "./planner";

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

const NOW = new Date(2026, 9, 30, 8, 0);

describe("reminderMessage", () => {
  test("english: starts now", () => {
    const m = reminderMessage(makeTask({ remind: 0 }), "en");
    expect(m).toEqual({ title: "Deep work", body: "Starts now · 09:30" });
  });
  test("english: minutes and hours", () => {
    expect(reminderMessage(makeTask({ remind: 15 }), "en").body).toBe("Starts in 15 min · 09:30");
    expect(reminderMessage(makeTask({ remind: 60 }), "en").body).toBe("Starts in 1 hr · 09:30");
    expect(reminderMessage(makeTask({ remind: 90 }), "en").body).toBe("Starts in 1 hr 30 min · 09:30");
    expect(reminderMessage(makeTask({ remind: 120 }), "en").body).toBe("Starts in 2 hr · 09:30");
  });
  test("vietnamese: now, minutes, hours", () => {
    expect(reminderMessage(makeTask({ remind: 0 }), "vi").body).toBe("Bắt đầu ngay · 09:30");
    expect(reminderMessage(makeTask({ remind: 15 }), "vi").body).toBe("Bắt đầu sau 15 phút · 09:30");
    expect(reminderMessage(makeTask({ remind: 60 }), "vi").body).toBe("Bắt đầu sau 1 giờ · 09:30");
    expect(reminderMessage(makeTask({ remind: 90 }), "vi").body).toBe("Bắt đầu sau 1 giờ 30 phút · 09:30");
  });
  test("never translates the user title", () => {
    expect(reminderMessage(makeTask({ title: "Họp nhóm" }), "en").title).toBe("Họp nhóm");
    expect(reminderMessage(makeTask({ title: "Team sync" }), "vi").title).toBe("Team sync");
  });
  test("treats missing remind as start time", () => {
    expect(reminderMessage(makeTask({ remind: undefined }), "en").body).toBe("Starts now · 09:30");
  });
});

describe("planReminders filtering", () => {
  test("includes an upcoming task at start minus remind", () => {
    const [r] = planReminders([makeTask()], NOW, {});
    expect(r.taskId).toBe("t1");
    expect(r.fireAt).toEqual(new Date(2026, 9, 30, 9, 15));
    expect(r.title).toBe("Deep work");
    expect(r.body).toBe("Starts in 15 min · 09:30");
    expect(r.id).toMatch(/^dayform:task:t1:[0-9a-f]+$/);
  });
  test("excludes a fireAt in the past", () => {
    expect(planReminders([makeTask({ start: "08:10", remind: 15 })], NOW, {})).toEqual([]);
  });
  test("excludes a fireAt exactly equal to now", () => {
    expect(planReminders([makeTask({ start: "08:15", remind: 15 })], NOW, {})).toEqual([]);
  });
  test("includes remind 0 when start is after now", () => {
    const [r] = planReminders([makeTask({ start: "08:01", remind: 0 })], NOW, {});
    expect(r.fireAt).toEqual(new Date(2026, 9, 30, 8, 1));
  });
  test("excludes done tasks", () => {
    expect(planReminders([makeTask({ status: "done" })], NOW, {})).toEqual([]);
  });
  test("keeps in_progress tasks", () => {
    expect(planReminders([makeTask({ status: "in_progress" })], NOW, {})).toHaveLength(1);
  });
  test("excludes tasks without a reminder", () => {
    expect(planReminders([makeTask({ remind: null }), makeTask({ id: "t2", remind: undefined })], NOW, {})).toEqual([]);
  });
  test("excludes backlog tasks (no date or no start)", () => {
    expect(planReminders([makeTask({ date: null }), makeTask({ id: "b", start: null })], NOW, {})).toEqual([]);
  });
  test("excludes malformed dates and times instead of producing Invalid Date", () => {
    const bad = [makeTask({ date: "nope" }), makeTask({ id: "b", start: "9am" }), makeTask({ id: "c", remind: -5 })];
    expect(planReminders(bad, NOW, {})).toEqual([]);
  });
  test("handles an empty list", () => {
    expect(planReminders([], NOW, {})).toEqual([]);
  });
  test("remind 60 crosses midnight into the previous day", () => {
    const now = new Date(2026, 9, 30, 12, 0);
    const [r] = planReminders([makeTask({ date: "2026-10-31", start: "00:30", remind: 60 })], now, {});
    expect(r.fireAt).toEqual(new Date(2026, 9, 30, 23, 30));
  });
  test("crossing a month and year boundary", () => {
    const now = new Date(2026, 11, 31, 12, 0);
    const [r] = planReminders([makeTask({ date: "2027-01-01", start: "00:10", remind: 30 })], now, {});
    expect(r.fireAt).toEqual(new Date(2026, 11, 31, 23, 40));
  });
});

describe("planReminders ordering, limit and ids", () => {
  test("sorts ascending by fireAt then taskId", () => {
    const tasks = [
      makeTask({ id: "c", start: "10:00", remind: 0 }),
      makeTask({ id: "b", start: "09:00", remind: 0 }),
      makeTask({ id: "a", start: "09:00", remind: 0 }),
    ];
    expect(planReminders(tasks, NOW, {}).map((r) => r.taskId)).toEqual(["a", "b", "c"]);
  });
  test("applies the limit after sorting", () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `t${i}`, start: `${String(20 - i).padStart(2, "0")}:00`, remind: 0 }));
    const planned = planReminders(tasks, NOW, { limit: 3 });
    expect(planned.map((r) => r.taskId)).toEqual(["t9", "t8", "t7"]);
  });
  test("defaults to a limit of 50", () => {
    const tasks = Array.from({ length: 80 }, (_, i) => makeTask({ id: `t${i}`, start: "10:00", remind: 0 }));
    expect(planReminders(tasks, NOW, {})).toHaveLength(50);
  });
  test("does not mutate the input", () => {
    const tasks = [makeTask({ id: "b" }), makeTask({ id: "a" })];
    const copy = [...tasks];
    planReminders(tasks, NOW, {});
    expect(tasks).toEqual(copy);
  });
  test("same input gives the same ids", () => {
    const a = planReminders([makeTask()], NOW, { language: "en" });
    const b = planReminders([makeTask()], new Date(2026, 9, 30, 8, 5), { language: "en" });
    expect(a[0].id).toBe(b[0].id);
  });
  test("id changes when title, time, remind or language changes", () => {
    const base = planReminders([makeTask()], NOW, { language: "en" })[0].id;
    const ids = [
      planReminders([makeTask({ title: "Other" })], NOW, { language: "en" })[0].id,
      planReminders([makeTask({ start: "09:45" })], NOW, { language: "en" })[0].id,
      planReminders([makeTask({ date: "2026-11-02" })], NOW, { language: "en" })[0].id,
      planReminders([makeTask({ remind: 30 })], NOW, { language: "en" })[0].id,
      planReminders([makeTask()], NOW, { language: "vi" })[0].id,
    ];
    for (const id of ids) expect(id).not.toBe(base);
    expect(new Set([base, ...ids]).size).toBe(ids.length + 1);
  });
  test("defaults the language to english", () => {
    expect(planReminders([makeTask()], NOW, {})[0].body).toBe("Starts in 15 min · 09:30");
  });
  test("a non-positive limit yields nothing", () => {
    expect(planReminders([makeTask()], NOW, { limit: 0 })).toEqual([]);
  });
});

type Call = { op: "list" } | { op: "schedule"; id: string } | { op: "cancel"; ids: string[] };

function fakeScheduler(initial: string[], failing: { schedule?: string[]; cancel?: string[]; list?: boolean } = {}) {
  const ids = new Set(initial);
  const calls: Call[] = [];
  const scheduler: ReminderScheduler = {
    async listScheduledIds() {
      calls.push({ op: "list" });
      if (failing.list) throw new Error("list failed");
      return [...ids];
    },
    async schedule(r) {
      calls.push({ op: "schedule", id: r.id });
      if (failing.schedule?.includes(r.id)) throw new Error(`boom ${r.id}`);
      ids.add(r.id);
    },
    async cancel(list) {
      calls.push({ op: "cancel", ids: list });
      if (list.some((id) => failing.cancel?.includes(id))) throw new Error(`cancel boom ${list.join(",")}`);
      for (const id of list) ids.delete(id);
    },
  };
  return { scheduler, calls, ids };
}

function planned(id: string): PlannedReminder {
  return { id, taskId: id, fireAt: new Date(2026, 9, 30, 9, 0), title: "T", body: "B" };
}

describe("reconcileReminders", () => {
  test("schedules missing and cancels stale ours", async () => {
    const { scheduler, ids } = fakeScheduler(["dayform:task:old:1"]);
    const result = await reconcileReminders(scheduler, [planned("dayform:task:new:2")]);
    expect(result).toEqual({ scheduled: 1, cancelled: 1, errors: [] });
    expect([...ids]).toEqual(["dayform:task:new:2"]);
  });
  test("a second run makes no calls besides list", async () => {
    const { scheduler, calls } = fakeScheduler([]);
    const input = [planned("dayform:task:a:1"), planned("dayform:task:b:2")];
    await reconcileReminders(scheduler, input);
    calls.length = 0;
    const second = await reconcileReminders(scheduler, input);
    expect(second).toEqual({ scheduled: 0, cancelled: 0, errors: [] });
    expect(calls).toEqual([{ op: "list" }]);
  });
  test("leaves foreign ids alone", async () => {
    const { scheduler, ids } = fakeScheduler(["other:app:1", "dayform:task:old:1", "dayform:other:2"]);
    await reconcileReminders(scheduler, []);
    expect([...ids].sort()).toEqual(["dayform:other:2", "other:app:1"]);
  });
  test("does not call cancel when nothing is stale", async () => {
    const { scheduler, calls } = fakeScheduler(["x"]);
    await reconcileReminders(scheduler, []);
    expect(calls).toEqual([{ op: "list" }]);
  });
  test("a scheduling failure is recorded and the rest continue", async () => {
    const { scheduler, ids } = fakeScheduler([], { schedule: ["dayform:task:b:2"] });
    const input = [planned("dayform:task:a:1"), planned("dayform:task:b:2"), planned("dayform:task:c:3")];
    const result = await reconcileReminders(scheduler, input);
    expect(result.scheduled).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("boom dayform:task:b:2");
    expect([...ids].sort()).toEqual(["dayform:task:a:1", "dayform:task:c:3"]);
  });
  test("a cancel failure is recorded without aborting scheduling", async () => {
    const { scheduler, ids } = fakeScheduler(["dayform:task:old:1"], { cancel: ["dayform:task:old:1"] });
    const result = await reconcileReminders(scheduler, [planned("dayform:task:a:1")]);
    expect(result.cancelled).toBe(0);
    expect(result.scheduled).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(ids.has("dayform:task:a:1")).toBe(true);
  });
  test("cancel failure in a batch retries each id so one bad id does not block the others", async () => {
    const { scheduler, ids } = fakeScheduler(
      ["dayform:task:x:1", "dayform:task:y:2"],
      { cancel: ["dayform:task:x:1"] },
    );
    const result = await reconcileReminders(scheduler, []);
    expect(result.cancelled).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect([...ids]).toEqual(["dayform:task:x:1"]);
  });
  test("a list failure is reported and nothing else is attempted", async () => {
    const { scheduler, calls } = fakeScheduler([], { list: true });
    const result = await reconcileReminders(scheduler, [planned("dayform:task:a:1")]);
    expect(result.scheduled).toBe(0);
    expect(result.errors).toEqual(["list failed"]);
    expect(calls).toEqual([{ op: "list" }]);
  });
  test("non-Error throws are stringified", async () => {
    const scheduler: ReminderScheduler = {
      listScheduledIds: async () => { throw "plain string"; },
      schedule: async () => undefined,
      cancel: async () => undefined,
    };
    const result = await reconcileReminders(scheduler, []);
    expect(result.errors).toEqual(["plain string"]);
  });
});

describe("reconcileReminders snooze lifecycle", () => {
  const live = new Set(["a"]);
  test("cancels scheduled snoozes of tasks that are no longer live", async () => {
    const { scheduler, ids } = fakeScheduler(["dayform:snooze:a:100", "dayform:snooze:gone:200", "other:app:1"]);
    const result = await reconcileReminders(scheduler, [], live);
    expect([...ids].sort()).toEqual(["dayform:snooze:a:100", "other:app:1"]);
    expect(result.cancelled).toBe(1);
  });
  test("keeps task ids that contain colons (series occurrences)", async () => {
    const { scheduler, ids } = fakeScheduler(["dayform:snooze:s1:2026-10-30:999", "dayform:snooze:s2:2026-10-30:999"]);
    await reconcileReminders(scheduler, [], new Set(["s1:2026-10-30"]));
    expect([...ids]).toEqual(["dayform:snooze:s1:2026-10-30:999"]);
  });
  test("leaves snoozes alone when liveTaskIds is omitted", async () => {
    const { scheduler, ids } = fakeScheduler(["dayform:snooze:gone:200"]);
    await reconcileReminders(scheduler, []);
    expect([...ids]).toEqual(["dayform:snooze:gone:200"]);
  });
  test("a malformed snooze id (no timestamp) is treated as stale", async () => {
    const { scheduler, ids } = fakeScheduler(["dayform:snooze:nonsense"]);
    await reconcileReminders(scheduler, [], live);
    expect([...ids]).toEqual([]);
  });
  test("cancel failures of snoozes are reported", async () => {
    const { scheduler } = fakeScheduler(["dayform:snooze:gone:1"], { cancel: ["dayform:snooze:gone:1"] });
    const result = await reconcileReminders(scheduler, [], live);
    expect(result.errors).toHaveLength(1);
  });
});

describe("planReminders strict time", () => {
  test.each(["99:99", "24:00", "12:60", "7:30"])("rejects start %s", (start) => {
    expect(planReminders([makeTask({ start })], NOW, {})).toEqual([]);
  });
  test.each(["00:00", "23:59"])("accepts start %s", (start) => {
    const task = makeTask({ date: "2026-11-05", start });
    expect(planReminders([task], NOW, {})).toHaveLength(1);
  });
});

