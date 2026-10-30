import { describe, test, expect } from "bun:test";
import { createWidgetSyncer, type WidgetSyncInput } from "./widget-syncer";
import type { Task } from "./planner";

const NOW = new Date(2026, 9, 29, 8, 15);
const DELAY = 5;
const WAIT = 40;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Deep work",
    date: "2026-10-29",
    start: "09:30",
    duration: 45,
    status: "todo",
    category: "Focus",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function setup(initial: Partial<WidgetSyncInput> = {}, sendResult: () => Promise<boolean> = async () => true) {
  let input: WidgetSyncInput = { tasks: [makeTask()], showTitles: true, locale: "en", pet: "round-cat", petWalks: true, canSync: true, ...initial };
  const sent: string[] = [];
  const syncer = createWidgetSyncer({
    read: () => input,
    send: async (json) => {
      sent.push(json);
      return sendResult();
    },
    now: () => NOW,
    delayMs: DELAY,
  });
  return {
    syncer,
    sent,
    set: (next: Partial<WidgetSyncInput>) => {
      input = { ...input, ...next };
    },
  };
}

describe("createWidgetSyncer", () => {
  test("sends the snapshot after the debounce", async () => {
    const { syncer, sent } = setup();
    syncer.schedule();
    expect(sent.length).toBe(0);
    await sleep(WAIT);
    expect(sent.length).toBe(1);
    expect(JSON.parse(sent[0]).days["2026-10-29"].items[0].t).toBe("Deep work");
    syncer.dispose();
  });

  test("sends again when the pet changes", async () => {
    const { syncer, sent, set } = setup();
    syncer.schedule();
    await sleep(WAIT);
    set({ pet: "dog" });
    syncer.schedule();
    await sleep(WAIT);
    expect(sent.length).toBe(2);
    expect(JSON.parse(sent[1]).pet).toBe("dog");
    syncer.dispose();
  });

  test("coalesces rapid schedules into one send", async () => {
    const { syncer, sent } = setup();
    syncer.schedule();
    syncer.schedule();
    syncer.schedule();
    await sleep(WAIT);
    expect(sent.length).toBe(1);
    syncer.dispose();
  });

  test("never sends while tasks are not trustworthy", async () => {
    const { syncer, sent } = setup({ canSync: false });
    syncer.schedule();
    await sleep(WAIT);
    expect(sent.length).toBe(0);
    syncer.dispose();
  });

  test("skips an unchanged snapshot but sends a changed one", async () => {
    const { syncer, sent, set } = setup();
    syncer.schedule();
    await sleep(WAIT);
    syncer.schedule();
    await sleep(WAIT);
    expect(sent.length).toBe(1);
    set({ tasks: [makeTask({ status: "done" })] });
    syncer.schedule();
    await sleep(WAIT);
    expect(sent.length).toBe(2);
    syncer.dispose();
  });

  test("resends an unchanged snapshot when forced", async () => {
    const { syncer, sent } = setup();
    syncer.schedule();
    await sleep(WAIT);
    syncer.schedule({ force: true });
    await sleep(WAIT);
    expect(sent.length).toBe(2);
    syncer.dispose();
  });

  test("retries later when the native side reports failure", async () => {
    const { syncer, sent } = setup({}, async () => false);
    syncer.schedule();
    await sleep(WAIT);
    syncer.schedule();
    await sleep(WAIT);
    expect(sent.length).toBe(2);
    syncer.dispose();
  });

  test("swallows a throwing sender and keeps working", async () => {
    let calls = 0;
    const { syncer, sent } = setup({}, async () => {
      calls += 1;
      if (calls === 1) throw new Error("native down");
      return true;
    });
    syncer.schedule();
    await sleep(WAIT);
    syncer.schedule();
    await sleep(WAIT);
    expect(sent.length).toBe(2);
    syncer.dispose();
  });

  test("a change during an in-flight send triggers one more send with fresh input", async () => {
    let release: (value: boolean) => void = () => undefined;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const { syncer, sent, set } = setup({}, () => {
      calls += 1;
      return calls === 1 ? gate : Promise.resolve(true);
    });
    syncer.schedule();
    await sleep(WAIT);
    expect(sent.length).toBe(1);
    set({ tasks: [makeTask({ title: "Changed" })] });
    syncer.schedule();
    await sleep(WAIT);
    expect(sent.length).toBe(1); // still waiting for the first send
    release(true);
    await sleep(WAIT);
    expect(sent.length).toBe(2);
    expect(JSON.parse(sent[1]).days["2026-10-29"].items[0].t).toBe("Changed");
    syncer.dispose();
  });

  test("dispose cancels a pending send and ignores later schedules", async () => {
    const { syncer, sent } = setup();
    syncer.schedule();
    syncer.dispose();
    syncer.schedule();
    await sleep(WAIT);
    expect(sent.length).toBe(0);
  });

  test("dispose while a send is in flight does not send again", async () => {
    let release: (value: boolean) => void = () => undefined;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const { syncer, sent } = setup({}, () => gate);
    syncer.schedule();
    await sleep(WAIT);
    syncer.schedule();
    await sleep(WAIT);
    syncer.dispose();
    release(true);
    await sleep(WAIT);
    expect(sent.length).toBe(1);
  });

  test("uses the real clock and default delay when none are injected", async () => {
    const sent: string[] = [];
    const syncer = createWidgetSyncer({
      read: () => ({ tasks: [], showTitles: true, locale: "vi", pet: "round-cat", petWalks: true, canSync: true }),
      send: async (json) => {
        sent.push(json);
        return true;
      },
    });
    syncer.schedule();
    syncer.dispose();
    expect(sent.length).toBe(0);
  });
});
