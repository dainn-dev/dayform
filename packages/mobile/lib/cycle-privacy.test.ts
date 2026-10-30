import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CYCLE_STATE, type CycleState } from "./cycle";
import { planCycleReminders } from "./cycle-reminders";
import {
  DEFAULT_ACTION_ID,
  DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  dedupeKey,
  parseResponse,
  runAction,
  type ActionContext,
  type RawResponse,
} from "./notification-actions";
import { buildWidgetSnapshot } from "./widget-snapshot";

const ROOT = resolve(import.meta.dir, "..");

describe("a period-tracker notification can never act on a task", () => {
  const state: CycleState = {
    ...DEFAULT_CYCLE_STATE, enabled: true, acknowledged: true,
    periods: ["2026-07-08", "2026-08-05", "2026-09-02", "2026-09-30"].map(start => ({ start })),
  };
  const [reminder] = planCycleReminders({ state, now: new Date(2026, 9, 5, 8, 0), today: "2026-10-05", language: "en" });

  /** Exactly what the scheduler hands the OS for a cycle reminder: title and body, and no data at all. */
  const responseFor = (actionIdentifier: string): RawResponse => ({
    actionIdentifier,
    notification: { date: 1, request: { identifier: reminder!.id, content: {} } },
  });

  function spies() {
    const calls: string[] = [];
    const context: ActionContext = {
      tasks: [], language: "en", writesBlocked: () => false,
      mutate: async () => { calls.push("mutate"); return true; },
      schedule: async () => { calls.push("schedule"); },
      open: () => { calls.push("open"); },
      warn: () => { calls.push("warn"); },
      now: () => new Date(2026, 9, 5, 8, 0),
    };
    return { calls, context };
  }

  test("there is a reminder to test with, and it carries no data", () => {
    expect(reminder).toBeDefined();
    expect(reminder!.id.startsWith("dayform:cycle:")).toBe(true);
    expect(Object.keys(reminder!)).not.toContain("data");
  });

  test("tap, Done and Snooze responses all parse to ignore", () => {
    for (const action of [DEFAULT_ACTION_ID, DONE_ACTION_ID, SNOOZE_ACTION_ID]) {
      const response = responseFor(action);
      expect(parseResponse({ actionIdentifier: response.actionIdentifier, data: response.notification.request.content.data }))
        .toEqual({ kind: "ignore" });
    }
  });

  test("even a hostile payload that is not a task id is ignored", () => {
    for (const data of [undefined, null, {}, [], "taskId", { taskId: "" }, { taskId: 7 }, { cycle: "/cycle" }, { url: "dayform://cycle" }]) {
      expect(parseResponse({ actionIdentifier: DEFAULT_ACTION_ID, data })).toEqual({ kind: "ignore" });
    }
  });

  test("running the ignored action touches no handler: no Done, no Snooze, no open, no warning", async () => {
    for (const action of [DEFAULT_ACTION_ID, DONE_ACTION_ID, SNOOZE_ACTION_ID]) {
      const { calls, context } = spies();
      const response = responseFor(action);
      const parsed = parseResponse({ actionIdentifier: response.actionIdentifier, data: response.notification.request.content.data });
      expect(await runAction(parsed, context)).toBe("handled");
      expect(calls).toEqual([]);
    }
  });

  test("the response still has a dedupe key, so replays are dropped", () => {
    expect(dedupeKey(responseFor(DEFAULT_ACTION_ID))).toContain(reminder!.id);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    if (name === "build" || name === "node_modules") return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("the home-screen widget never sees the period tracker", () => {
  test("the snapshot it reads has no cycle field", () => {
    const { snapshot } = buildWidgetSnapshot([], { now: new Date(2026, 9, 29, 8, 0), showTitles: true, locale: "en" });
    expect(Object.keys(snapshot).sort()).toEqual(["days", "generatedAt", "labels", "locale", "pet", "petWalks", "version"]);
    expect(JSON.stringify(snapshot)).not.toMatch(/cycle|period|fertil/i);
  });

  test("nothing in the widget code or its native module mentions the tracker", () => {
    const files = [
      join(ROOT, "lib", "widget-snapshot.ts"),
      join(ROOT, "lib", "widget-syncer.ts"),
      join(ROOT, "components", "WidgetSync.tsx"),
      ...sourceFiles(join(ROOT, "modules", "dayform-widget")),
    ];
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect({ file, text: readFileSync(file, "utf8").match(/cycle|menstr|fertil/i) }).toEqual({ file, text: null });
  });
});
