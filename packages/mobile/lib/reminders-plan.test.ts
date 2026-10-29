import { describe, expect, test } from "bun:test";
import { DEFAULT_CYCLE_STATE, type CycleState } from "./cycle";
import { CYCLE_MAX_REMINDERS } from "./cycle-reminders";
import type { Task } from "./planner";
import {
  CYCLE_ID_PREFIX,
  DEFAULT_REMINDER_LIMIT,
  REMINDER_ID_PREFIX,
  SUMMARY_ID_PREFIX,
} from "./reminders";
import { IOS_PENDING_LIMIT, cycleActive, planAllReminders, taskReminderLimit, type CycleSync } from "./reminders-plan";
import { DEFAULT_SETTINGS } from "./settings";
import { SUMMARY_DAYS } from "./summary-notification";

const NOW = new Date(2026, 9, 5, 8, 0);
const REGULAR = ["2026-07-08", "2026-08-05", "2026-09-02", "2026-09-30"].map(start => ({ start }));
const tracker = (patch: Partial<CycleState> = {}): CycleState => ({
  ...DEFAULT_CYCLE_STATE, enabled: true, acknowledged: true, periods: REGULAR, ...patch,
  reminders: { ...DEFAULT_CYCLE_STATE.reminders, notifyFertile: true },
});
const sync = (patch: Partial<CycleSync> = {}, state: CycleState = tracker()): CycleSync => ({ state, ready: true, locked: false, ...patch });
const OFF: CycleSync = { state: DEFAULT_CYCLE_STATE, ready: true, locked: false };

/** One future task per day-and-hour slot, far more than any limit. */
function manyTasks(count: number): Task[] {
  return Array.from({ length: count }, (_, i): Task => ({
    id: `t${i}`, title: `Task ${i}`, date: "2026-11-01", start: "10:00", duration: 15, status: "todo", category: "Work",
    notes: "", createdAt: "2026-10-01T00:00:00.000Z", remind: 5,
  }));
}
const notifications = (patch: Partial<typeof DEFAULT_SETTINGS.notifications> = {}) => ({ ...DEFAULT_SETTINGS.notifications, ...patch });
const count = (ids: string[], prefix: string) => ids.filter(id => id.startsWith(prefix)).length;

describe("notification budget", () => {
  test("the task limit leaves room for the summaries and the cycle reminders", () => {
    expect(DEFAULT_REMINDER_LIMIT).toBe(50);
    expect(SUMMARY_DAYS).toBe(7);
    expect(CYCLE_MAX_REMINDERS).toBe(6);
    expect(taskReminderLimit(false, false)).toBe(50);
    expect(taskReminderLimit(true, false)).toBe(43);
    expect(taskReminderLimit(false, true)).toBe(44);
    expect(taskReminderLimit(true, true)).toBe(37);
  });

  test("tasks + summaries + cycle never exceed 50, which leaves 14 of iOS's 64 for snoozes", () => {
    for (const summary of [false, true]) {
      for (const cycle of [false, true]) {
        const worst = taskReminderLimit(summary, cycle) + (summary ? SUMMARY_DAYS : 0) + (cycle ? CYCLE_MAX_REMINDERS : 0);
        expect(worst).toBe(DEFAULT_REMINDER_LIMIT);
        expect(IOS_PENDING_LIMIT - worst).toBeGreaterThanOrEqual(14);
      }
    }
  });

  test("with every feature on and plenty of tasks the real plan fits the budget", () => {
    const tasks = manyTasks(200).map((task, i) => ({ ...task, date: `2026-10-${String((i % 7) + 6).padStart(2, "0")}` }));
    const { planned } = planAllReminders({
      tasks, language: "en", notifications: notifications({ summaryEnabled: true, summaryTime: "07:00" }), cycle: sync(), now: NOW,
    });
    const ids = planned.map(item => item.id);
    expect(count(ids, REMINDER_ID_PREFIX)).toBe(37);
    expect(count(ids, SUMMARY_ID_PREFIX)).toBe(7);
    expect(count(ids, CYCLE_ID_PREFIX)).toBeGreaterThan(0);
    expect(count(ids, CYCLE_ID_PREFIX)).toBeLessThanOrEqual(CYCLE_MAX_REMINDERS);
    expect(ids.length).toBeLessThanOrEqual(DEFAULT_REMINDER_LIMIT);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cycleActive", () => {
  test("needs a readable, enabled, unpaused tracker", () => {
    expect(cycleActive(sync())).toBe(true);
    expect(cycleActive(sync({ ready: false }))).toBe(false);
    expect(cycleActive(sync({ locked: true }))).toBe(false);
    expect(cycleActive(sync({}, tracker({ enabled: false })))).toBe(false);
    expect(cycleActive(sync({}, tracker({ paused: true })))).toBe(false);
  });
});

describe("planAllReminders", () => {
  const run = (cycle: CycleSync, tasks: Task[] = manyTasks(100), settings = notifications()) =>
    planAllReminders({ tasks, language: "en", notifications: settings, cycle, now: NOW });

  test("an active tracker adds cycle reminders and lowers the task limit", () => {
    const { planned, keepCycle } = run(sync());
    const ids = planned.map(item => item.id);
    expect(keepCycle).toBe(false);
    expect(count(ids, CYCLE_ID_PREFIX)).toBeGreaterThan(0);
    expect(count(ids, REMINDER_ID_PREFIX)).toBe(44);
  });

  test("an off tracker plans no cycle reminder, restores the task limit and lets the reconciler cancel the old ones", () => {
    for (const cycle of [OFF, sync({}, tracker({ paused: true })), sync({}, tracker({ periods: [] }))]) {
      const { planned, keepCycle } = run(cycle);
      expect(count(planned.map(item => item.id), CYCLE_ID_PREFIX)).toBe(0);
      expect(keepCycle).toBe(false);
    }
    expect(count(run(OFF).planned.map(item => item.id), REMINDER_ID_PREFIX)).toBe(50);
  });

  test("an unknown tracker (loading or unreadable) plans nothing for it and asks to keep what is scheduled", () => {
    for (const cycle of [sync({ ready: false }), sync({ locked: true })]) {
      const { planned, keepCycle } = run(cycle);
      expect(count(planned.map(item => item.id), CYCLE_ID_PREFIX)).toBe(0);
      expect(keepCycle).toBe(true);
    }
  });

  test("quiet hours from the notification settings apply to the cycle reminders", () => {
    const quiet = notifications({ quietEnabled: true, quietFrom: "08:00", quietTo: "10:00" });
    const { planned } = run(sync({}, { ...tracker(), reminders: { ...tracker().reminders, time: "09:00" } }), [], quiet);
    const cycleOnes = planned.filter(item => item.id.startsWith(CYCLE_ID_PREFIX));
    expect(cycleOnes.length).toBeGreaterThan(0);
    expect(cycleOnes.every(item => item.fireAt.getHours() === 10 && item.fireAt.getMinutes() === 0)).toBe(true);
  });

  test("cycle text stays neutral next to task reminders that show titles", () => {
    const { planned } = run(sync(), manyTasks(1));
    expect(planned.filter(item => item.kind === "cycle").every(item => item.body === "Dayform: personal reminder")).toBe(true);
    expect(planned.find(item => item.id.startsWith(REMINDER_ID_PREFIX))!.title).toBe("Task 0");
  });
});
