import { describe, expect, test } from "bun:test";
import { fill } from "./assistant-answers";
import { vi } from "./i18n/assistant";
import { pickTip, ROUTE_TIPS, routeOf, situationalTips, tipAllowed, TIP_MIN_GAP_MS } from "./assistant-tips";
import type { Task } from "./planner";

let counter = 0;
const task = (over: Partial<Task>): Task => ({
  id: `t${counter++}`, title: "Secret title", date: "2026-10-30", start: "09:00", duration: 30, status: "todo",
  category: "Focus", notes: "", createdAt: "2026-10-01T00:00:00.000Z", ...over,
});
const at = (hour: number) => new Date(2026, 9, 30, hour, 0);
const texts = (tips: { text: string }[]) => tips.map(tip => tip.text);

describe("assistant tips", () => {
  test("routeOf maps the tabs and ignores other screens", () => {
    expect(routeOf("/")).toBe("timeline");
    expect(routeOf("/explore")).toBe("tasks");
    expect(routeOf("/stats/")).toBe("stats");
    expect(routeOf("/personal")).toBe("personal");
    expect(routeOf("/cycle")).toBeNull();
  });

  test("situational tips follow today's tasks", () => {
    expect(texts(situationalTips([], at(10)))).toEqual(["Nothing is planned today. Want to add one small thing?"]);
    expect(texts(situationalTips([task({ status: "done" })], at(14)))).toEqual(["Everything for today is done. Time to rest!"]);
    expect(texts(situationalTips([task({ start: "13:00" })], at(9)))).toEqual(["Good morning! {n} tasks are waiting today."]);
    const evening = texts(situationalTips([task({ start: "13:00" })], at(21)));
    expect(evening).toContain("{n} tasks are still open tonight. Finish one, or plan them for tomorrow.");
    expect(texts(situationalTips([task({ start: "08:00" })], at(10)))).toContain("{n} tasks are past their time and not done yet.");
  });

  test("a tip never contains a task title", () => {
    const lines = situationalTips([task({ start: "08:00" })], at(21));
    for (const line of lines) expect(fill(line.text, line.vars)).not.toContain("Secret");
  });

  test("pickTip avoids the last line and honours routeOnly", () => {
    const first = ROUTE_TIPS.timeline[0].text;
    expect(pickTip("timeline", [], at(23), first, () => 0)?.text).toBe(ROUTE_TIPS.timeline[1].text);
    expect(pickTip("stats", [], at(23), "x", () => 0.99, { routeOnly: true })?.text).toBe(ROUTE_TIPS.stats[0].text);
    expect(pickTip(null, [], at(23), null, () => 0, { routeOnly: true })).toBeNull();
    // With only one candidate it repeats rather than staying silent.
    expect(pickTip("stats", [], at(23), ROUTE_TIPS.stats[0].text, () => 0, { routeOnly: true })?.text).toBe(ROUTE_TIPS.stats[0].text);
  });

  test("tips are spaced out", () => {
    expect(tipAllowed(null, 1)).toBe(true);
    expect(tipAllowed(1000, 1000 + TIP_MIN_GAP_MS - 1)).toBe(false);
    expect(tipAllowed(1000, 1000 + TIP_MIN_GAP_MS)).toBe(true);
  });

  test("every tip text is translated", () => {
    const all = [...Object.values(ROUTE_TIPS).flat(), ...situationalTips([], at(10)), ...situationalTips([task({ start: "08:00" })], at(21)),
      ...situationalTips([task({ status: "done" })], at(14)), ...situationalTips([task({ start: "13:00" })], at(9))];
    for (const line of all) expect(vi[line.text]).toBeDefined();
  });
});
