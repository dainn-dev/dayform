import { describe, test, expect } from "bun:test";
import { layoutLanes } from "./timeline-layout";

type Item = { id: string; start: string | null; duration: number };
const item = (id: string, start: string | null, duration: number): Item => ({ id, start, duration });

describe("layoutLanes", () => {
  test("puts a single task in lane 0 of 1", () => {
    const result = layoutLanes([item("a", "09:00", 60)], 0);
    expect(result).toEqual({ a: { lane: 0, lanes: 1 } });
  });

  test("returns an empty map for no tasks", () => {
    expect(layoutLanes([], 36)).toEqual({});
  });

  test("lays out an overlap chain A-B-C so A and C share lane 0 and B takes lane 1", () => {
    const result = layoutLanes([item("a", "09:00", 60), item("b", "09:30", 60), item("c", "10:00", 60)], 0);
    expect(result.a).toEqual({ lane: 0, lanes: 2 });
    expect(result.b).toEqual({ lane: 1, lanes: 2 });
    expect(result.c).toEqual({ lane: 0, lanes: 2 });
  });

  test("uses three lanes when three tasks all overlap", () => {
    const result = layoutLanes([item("a", "09:00", 120), item("b", "09:30", 90), item("c", "10:00", 60)], 0);
    expect(result.a).toEqual({ lane: 0, lanes: 3 });
    expect(result.b).toEqual({ lane: 1, lanes: 3 });
    expect(result.c).toEqual({ lane: 2, lanes: 3 });
  });

  test("keeps back-to-back tasks in separate clusters with one lane each", () => {
    const result = layoutLanes([item("a", "09:00", 60), item("b", "10:00", 60)], 0);
    expect(result.a).toEqual({ lane: 0, lanes: 1 });
    expect(result.b).toEqual({ lane: 0, lanes: 1 });
  });

  test("orders identical start times deterministically by id", () => {
    const forward = layoutLanes([item("a", "09:00", 60), item("b", "09:00", 60)], 0);
    const reversed = layoutLanes([item("b", "09:00", 60), item("a", "09:00", 60)], 0);
    expect(forward).toEqual(reversed);
    expect(forward.a).toEqual({ lane: 0, lanes: 2 });
    expect(forward.b).toEqual({ lane: 1, lanes: 2 });
  });

  test("treats a short task as visually overlapping the next one within minVisualMinutes", () => {
    const tasks = [item("a", "09:00", 10), item("b", "09:15", 10)];
    const padded = layoutLanes(tasks, 36);
    expect(padded.a).toEqual({ lane: 0, lanes: 2 });
    expect(padded.b).toEqual({ lane: 1, lanes: 2 });
  });

  test("gives short tasks one lane each when minVisualMinutes is 0", () => {
    const result = layoutLanes([item("a", "09:00", 10), item("b", "09:15", 10)], 0);
    expect(result.a).toEqual({ lane: 0, lanes: 1 });
    expect(result.b).toEqual({ lane: 0, lanes: 1 });
  });

  test("ignores tasks with a null start", () => {
    const result = layoutLanes([item("a", "09:00", 60), item("x", null, 60)], 0);
    expect(result).toEqual({ a: { lane: 0, lanes: 1 } });
    expect("x" in result).toBe(false);
  });

  test("does not let separate clusters affect each other's lane count", () => {
    const result = layoutLanes(
      [item("a", "08:00", 60), item("b", "08:30", 60), item("c", "13:00", 60)],
      0,
    );
    expect(result.a.lanes).toBe(2);
    expect(result.b.lanes).toBe(2);
    expect(result.c).toEqual({ lane: 0, lanes: 1 });
  });

  test("reuses a lane freed inside a cluster", () => {
    const result = layoutLanes([item("a", "09:00", 30), item("b", "09:10", 120), item("c", "09:30", 30)], 0);
    expect(result.a).toEqual({ lane: 0, lanes: 2 });
    expect(result.b).toEqual({ lane: 1, lanes: 2 });
    expect(result.c).toEqual({ lane: 0, lanes: 2 });
  });

  test("a block starting exactly at a.start + minVisualMinutes forms a separate cluster", () => {
    const result = layoutLanes([item("a", "09:00", 10), item("b", "09:36", 10)], 36);
    expect(result.a).toEqual({ lane: 0, lanes: 1 });
    expect(result.b).toEqual({ lane: 0, lanes: 1 });
  });

  test("a block one minute before a.start + minVisualMinutes shares a cluster", () => {
    const result = layoutLanes([item("a", "09:00", 10), item("b", "09:35", 10)], 36);
    expect(result.a).toEqual({ lane: 0, lanes: 2 });
    expect(result.b).toEqual({ lane: 1, lanes: 2 });
  });

  test("lays out a task crossing 22:00 (21:30 for 120 minutes) alongside a later one", () => {
    const result = layoutLanes([item("a", "21:30", 120), item("b", "22:00", 30), item("c", "23:30", 10)], 0);
    expect(result.a).toEqual({ lane: 0, lanes: 2 });
    expect(result.b).toEqual({ lane: 1, lanes: 2 });
    expect(result.c).toEqual({ lane: 0, lanes: 1 });
  });

  test("a zero-duration task occupies minVisualMinutes when it is positive", () => {
    const result = layoutLanes([item("a", "09:00", 0), item("b", "09:10", 0)], 30);
    expect(result.a).toEqual({ lane: 0, lanes: 2 });
    expect(result.b).toEqual({ lane: 1, lanes: 2 });
  });

  test("zero-duration tasks at distinct times do not collide when minVisualMinutes is 0", () => {
    const result = layoutLanes([item("a", "09:00", 0), item("b", "09:00", 0)], 0);
    expect(result.a).toEqual({ lane: 0, lanes: 1 });
    expect(result.b).toEqual({ lane: 0, lanes: 1 });
  });

  test("a later member that widens the cluster updates the lane count of earlier members", () => {
    const tasks = [
      item("a", "09:00", 180), item("b", "09:30", 30), item("c", "10:15", 60), item("d", "10:30", 30),
    ];
    const result = layoutLanes(tasks, 0);
    expect(result.a).toEqual({ lane: 0, lanes: 3 });
    expect(result.b).toEqual({ lane: 1, lanes: 3 });
    expect(result.c).toEqual({ lane: 1, lanes: 3 });
    expect(result.d).toEqual({ lane: 2, lanes: 3 });
  });

  test("does not mutate the input array or its items", () => {
    const tasks = [item("b", "10:00", 60), item("a", "09:00", 60)];
    const snapshot = JSON.parse(JSON.stringify(tasks));
    layoutLanes(tasks, 36);
    expect(tasks).toEqual(snapshot);
    expect(tasks[0].id).toBe("b");
  });
});
