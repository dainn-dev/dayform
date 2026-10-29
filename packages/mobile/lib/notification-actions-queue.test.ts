import { describe, test, expect } from "bun:test";
import { createActionQueue, runAction, type ActionContext, type ActionOutcome } from "./notification-actions";
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

function makeContext(overrides: Partial<ActionContext> = {}) {
  const calls = { mutate: 0, schedule: [] as string[], open: [] as string[], warn: [] as string[] };
  const context: ActionContext = {
    tasks: [makeTask({ id: "a" })],
    language: "en",
    writesBlocked: () => false,
    mutate: async () => { calls.mutate += 1; return true; },
    schedule: async (reminder) => { calls.schedule.push(reminder.taskId); },
    open: (taskId) => { calls.open.push(taskId); },
    warn: (message, error) => {
      const detail = error instanceof Error ? error.message : String(error);
      calls.warn.push(error === undefined ? message : `${message}: ${detail}`);
    },
    now: () => new Date(2026, 9, 30, 9, 0),
    ...overrides,
  };
  return { context, calls };
}

describe("runAction", () => {
  test("ignore is handled without side effects", async () => {
    const { context, calls } = makeContext();
    expect(await runAction({ kind: "ignore" }, context)).toBe("handled");
    expect(calls.mutate).toBe(0);
  });
  test("open navigates", async () => {
    const { context, calls } = makeContext();
    expect(await runAction({ kind: "open", taskId: "a" }, context)).toBe("handled");
    expect(calls.open).toEqual(["a"]);
  });
  test("done writes silently and is handled on success", async () => {
    let options: unknown;
    const { context } = makeContext({ mutate: async (_update, o) => { options = o; return true; } });
    expect(await runAction({ kind: "done", taskId: "a" }, context)).toBe("handled");
    expect(options).toEqual({ silent: true });
  });
  test("done while writes are blocked is retried and never writes", async () => {
    const { context, calls } = makeContext({ writesBlocked: () => true });
    expect(await runAction({ kind: "done", taskId: "a" }, context)).toBe("retry");
    expect(calls.mutate).toBe(0);
  });
  test("a write refused because writes became blocked is retried", async () => {
    let blocked = false;
    const { context } = makeContext({ writesBlocked: () => blocked, mutate: async () => { blocked = true; return false; } });
    expect(await runAction({ kind: "done", taskId: "a" }, context)).toBe("retry");
  });
  test("a failed (not blocked) write is dropped with a warning", async () => {
    const { context, calls } = makeContext({ mutate: async () => false });
    expect(await runAction({ kind: "done", taskId: "a" }, context)).toBe("failed");
    expect(calls.warn).toHaveLength(1);
  });
  test("snooze schedules a reminder for a live task", async () => {
    const { context, calls } = makeContext();
    expect(await runAction({ kind: "snooze", taskId: "a" }, context)).toBe("handled");
    expect(calls.schedule).toEqual(["a"]);
  });
  test("snooze of a missing or done task does nothing", async () => {
    const { context, calls } = makeContext({ tasks: [makeTask({ id: "a", status: "done" })] });
    expect(await runAction({ kind: "snooze", taskId: "a" }, context)).toBe("handled");
    expect(await runAction({ kind: "snooze", taskId: "zzz" }, context)).toBe("handled");
    expect(calls.schedule).toEqual([]);
  });
  test("a failed schedule is reported as failed, not success", async () => {
    const { context, calls } = makeContext({ schedule: async () => { throw new Error("no permission"); } });
    expect(await runAction({ kind: "snooze", taskId: "a" }, context)).toBe("failed");
    expect(calls.warn[0]).toContain("no permission");
  });
  test("a non-Error rejection is stringified", async () => {
    const { context, calls } = makeContext({ schedule: async () => { throw "plain"; } });
    expect(await runAction({ kind: "snooze", taskId: "a" }, context)).toBe("failed");
    expect(calls.warn[0]).toContain("plain");
  });
});

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("createActionQueue", () => {
  function setup(outcomes: (r: string) => ActionOutcome | Error) {
    const state = { ready: true, handled: [] as string[], idle: 0, errors: 0 };
    const queue = createActionQueue<string>({
      ready: () => state.ready,
      keyOf: (r) => r,
      handle: async (r) => {
        state.handled.push(r);
        const outcome = outcomes(r);
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
      onIdle: () => { state.idle += 1; },
      onError: () => { state.errors += 1; },
    });
    return { state, queue };
  }

  test("handles each response once and clears when empty", async () => {
    const { state, queue } = setup(() => "handled");
    queue.push("a");
    queue.push("a");
    await flush();
    expect(state.handled).toEqual(["a"]);
    expect(state.idle).toBeGreaterThan(0);
  });
  test("waits until ready", async () => {
    const { state, queue } = setup(() => "handled");
    state.ready = false;
    queue.push("a");
    await flush();
    expect(state.handled).toEqual([]);
    expect(state.idle).toBe(0);
    state.ready = true;
    await queue.drain();
    expect(state.handled).toEqual(["a"]);
  });
  test("a retry keeps the response pending, does not clear, and is replayed later", async () => {
    let outcome: ActionOutcome = "retry";
    const { state, queue } = setup(() => outcome);
    queue.push("a");
    await flush();
    expect(state.handled).toEqual(["a"]);
    expect(state.idle).toBe(0);
    outcome = "handled";
    await queue.drain();
    expect(state.handled).toEqual(["a", "a"]);
    expect(state.idle).toBe(1);
  });
  test("a retry blocks later responses so order is kept", async () => {
    const { state, queue } = setup((r) => (r === "a" ? "retry" : "handled"));
    queue.push("a");
    await flush();
    queue.push("b");
    await flush();
    expect(state.handled).toEqual(["a", "a"]);
  });
  test("a failed response is dropped and remembered", async () => {
    const { state, queue } = setup(() => "failed");
    queue.push("a");
    await flush();
    queue.push("a");
    await flush();
    expect(state.handled).toEqual(["a"]);
    expect(state.idle).toBeGreaterThan(0);
  });
  test("a throwing handler is reported and dropped", async () => {
    const { state, queue } = setup(() => new Error("boom"));
    queue.push("a");
    await flush();
    expect(state.errors).toBe(1);
    expect(state.idle).toBeGreaterThan(0);
  });
  test("a drain requested while running is replayed afterwards", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const handled: string[] = [];
    let first = true;
    const queue = createActionQueue<string>({
      ready: () => true,
      keyOf: (r) => r,
      handle: async (r) => {
        handled.push(r);
        if (first) { first = false; await gate; return "retry"; }
        return "handled";
      },
      onIdle: () => undefined,
      onError: () => undefined,
    });
    queue.push("a");
    const running = queue.drain();
    const second = queue.drain();
    release();
    await Promise.all([running, second]);
    expect(handled).toEqual(["a", "a"]);
  });
});
