import { describe, test, expect } from "bun:test";
import { createUpdateStore, type UpdateStoreState } from "./update-store";
import { UPDATE_STORAGE_KEY } from "./update-state";
import { AUTO_CHECK_INTERVAL_MS, NETWORK_RETRY_DELAY_MS, shouldPrompt, type FetchLike } from "./update-check";
import type { KeyValueStorage } from "./task-storage";

const REPO = "https://github.com/dainn-dev/dayform/";
const T0 = 1_700_000_000_000;

function memoryStorage(initial: Record<string, string> = {}, opts: { failRead?: boolean; failWrite?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  const counts = { reads: 0, writes: 0 };
  const flags = { failWrite: opts.failWrite ?? false };
  const storage: KeyValueStorage = {
    getItem: async key => { counts.reads++; if (opts.failRead) throw new Error("read"); return data.get(key) ?? null; },
    setItem: async (key, value) => { counts.writes++; if (flags.failWrite) throw new Error("write"); data.set(key, value); },
  };
  const saved = () => JSON.parse(data.get(UPDATE_STORAGE_KEY) ?? "null") as { auto: boolean; lastCheckAt: number | null; skipped: string | null; retryAt?: number | null } | null;
  return { storage, counts, saved, flags };
}

const releaseBody = (version: string) => ({
  tag_name: `v${version}`,
  name: `Dayform ${version}`,
  body: "notes",
  html_url: `${REPO}releases/tag/v${version}`,
  assets: [{ name: "d.apk", browser_download_url: `${REPO}releases/download/v${version}/d.apk`, size: 10 }],
});
const reply = (status: number, body: unknown = {}) => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) });

function fakeFetch(...replies: Array<() => Promise<ReturnType<typeof reply>>>) {
  const calls: number[] = [];
  const fetchFn: FetchLike = async () => {
    const next = replies[Math.min(calls.length, replies.length - 1)];
    calls.push(calls.length);
    return next!();
  };
  return { fetchFn, calls };
}
const ok = (version: string) => async () => reply(200, releaseBody(version));
const status = (code: number) => async () => reply(code);
const fail = async () => { throw new TypeError("offline"); };

function setup(opts: { stored?: Record<string, unknown>; current?: string; replies?: Array<() => Promise<ReturnType<typeof reply>>>; failWrite?: boolean; failRead?: boolean; wrap?: (inner: KeyValueStorage) => KeyValueStorage } = {}) {
  const mem = memoryStorage(
    opts.stored ? { [UPDATE_STORAGE_KEY]: JSON.stringify(opts.stored) } : {},
    { failWrite: opts.failWrite, failRead: opts.failRead },
  );
  const net = fakeFetch(...(opts.replies ?? [ok("1.0.7")]));
  const clock = { t: T0 };
  const store = createUpdateStore({ storage: opts.wrap ? opts.wrap(mem.storage) : mem.storage, fetchFn: net.fetchFn, currentVersion: opts.current ?? "1.0.6", now: () => clock.t });
  return { store, mem, net, clock };
}

describe("initial state and load", () => {
  test("starts idle with auto on", () => {
    const { store } = setup();
    expect(store.getState()).toEqual({ status: "idle", release: null, errorReason: null, auto: true, lastCheckAt: null, promptOpen: false });
  });
  test("load reads the persisted state once and notifies", async () => {
    const { store, mem } = setup({ stored: { auto: false, lastCheckAt: 5, skipped: null } });
    let notified = 0;
    store.subscribe(() => { notified++; });
    await store.load();
    await store.load();
    expect(store.getState()).toMatchObject({ auto: false, lastCheckAt: 5 });
    expect(mem.counts.reads).toBe(1);
    expect(notified).toBe(1);
  });
  test("a read failure keeps defaults and writes nothing", async () => {
    const { store, mem } = setup({ failRead: true });
    await store.load();
    expect(store.getState().auto).toBe(true);
    expect(mem.counts.writes).toBe(0);
  });
  test("state is referentially stable while nothing changes", async () => {
    const { store } = setup();
    await store.load();
    const before = store.getState();
    store.dismiss();
    store.openPrompt();
    expect(store.getState()).toBe(before);
  });
  test("unsubscribe stops notifications", async () => {
    const { store } = setup();
    let notified = 0;
    const off = store.subscribe(() => { notified++; });
    off();
    await store.load();
    expect(notified).toBe(0);
  });
});

describe("checkAuto", () => {
  test("opens the prompt for a newer release and records the check time", async () => {
    const { store, mem, net } = setup();
    expect(await store.checkAuto()).toBe("checked");
    expect(net.calls).toHaveLength(1);
    const s = store.getState();
    expect(s).toMatchObject({ status: "available", promptOpen: true, lastCheckAt: T0, errorReason: null });
    expect(s.release?.version).toBe("1.0.7");
    expect(mem.saved()).toMatchObject({ lastCheckAt: T0, auto: true });
  });
  test("does nothing when the switch is off", async () => {
    const { store, net } = setup({ stored: { auto: false, lastCheckAt: null, skipped: null } });
    expect(await store.checkAuto()).toBe("disabled");
    expect(net.calls).toHaveLength(0);
    expect(store.getState().status).toBe("idle");
  });
  test("is throttled to once per 12 hours", async () => {
    const { store, net, clock } = setup();
    await store.checkAuto();
    store.dismiss();
    clock.t = T0 + AUTO_CHECK_INTERVAL_MS - 1;
    expect(await store.checkAuto()).toBe("throttled");
    clock.t = T0 + AUTO_CHECK_INTERVAL_MS;
    expect(await store.checkAuto()).toBe("checked");
    expect(net.calls).toHaveLength(2);
  });
  test("respects the throttle from a previous session", async () => {
    const { store, net } = setup({ stored: { auto: true, lastCheckAt: T0 - 1000, skipped: null } });
    expect(await store.checkAuto()).toBe("throttled");
    expect(net.calls).toHaveLength(0);
  });
  test("an up-to-date app does not prompt", async () => {
    const { store } = setup({ current: "1.0.7" });
    await store.checkAuto();
    expect(store.getState()).toMatchObject({ status: "up-to-date", promptOpen: false, release: null });
  });
  test("a skipped version is not prompted but is still reported as available", async () => {
    const { store } = setup({ stored: { auto: true, lastCheckAt: null, skipped: "1.0.7" } });
    await store.checkAuto();
    expect(store.getState()).toMatchObject({ status: "available", promptOpen: false });
  });
  test("a newer version than the skipped one is prompted", async () => {
    const { store } = setup({ stored: { auto: true, lastCheckAt: null, skipped: "1.0.7" }, replies: [ok("1.0.8")] });
    await store.checkAuto();
    expect(store.getState().promptOpen).toBe(true);
  });
  test("Later is remembered for the session only", async () => {
    const { store, clock } = setup();
    await store.checkAuto();
    store.dismiss();
    expect(store.getState()).toMatchObject({ promptOpen: false, status: "available" });
    clock.t += AUTO_CHECK_INTERVAL_MS;
    await store.checkAuto();
    expect(store.getState().promptOpen).toBe(false);
  });
  test("no release published (404) is up to date and counts as a completed check", async () => {
    const { store, mem } = setup({ replies: [status(404)] });
    await store.checkAuto();
    expect(store.getState()).toMatchObject({ status: "up-to-date", lastCheckAt: T0, errorReason: null });
    expect(mem.saved()?.lastCheckAt).toBe(T0);
  });
  test("a network error is silent and only schedules a retry, it does not count as a check", async () => {
    const { store, mem } = setup({ replies: [fail] });
    await store.checkAuto();
    expect(store.getState()).toMatchObject({ status: "idle", errorReason: null, lastCheckAt: null, promptOpen: false });
    expect(mem.saved()).toMatchObject({ lastCheckAt: null, retryAt: T0 + NETWORK_RETRY_DELAY_MS });
  });
  test("after a network error the automatic check waits 15 minutes, not for every foreground event", async () => {
    const { store, net, clock } = setup({ replies: [fail, ok("1.0.7")] });
    await store.checkAuto();
    clock.t = T0 + NETWORK_RETRY_DELAY_MS - 1;
    expect(await store.checkAuto()).toBe("throttled");
    expect(await store.checkAuto()).toBe("throttled");
    expect(net.calls).toHaveLength(1);
    clock.t = T0 + NETWORK_RETRY_DELAY_MS;
    expect(await store.checkAuto()).toBe("checked");
    expect(net.calls).toHaveLength(2);
    expect(store.getState().status).toBe("available");
  });
  test("the retry delay survives a restart and a success clears it", async () => {
    const { store, mem, net, clock } = setup({ replies: [fail, ok("1.0.7")] });
    await store.checkAuto();
    const restarted = createUpdateStore({ storage: mem.storage, fetchFn: net.fetchFn, currentVersion: "1.0.6", now: () => clock.t });
    expect(await restarted.checkAuto()).toBe("throttled");
    clock.t = T0 + NETWORK_RETRY_DELAY_MS;
    expect(await restarted.checkAuto()).toBe("checked");
    expect(mem.saved()).toMatchObject({ lastCheckAt: clock.t, retryAt: null });
  });
  test("an http 5xx counts as a network error and schedules the same retry", async () => {
    const { store, mem } = setup({ replies: [status(503)] });
    await store.checkAuto();
    expect(store.getState()).toMatchObject({ status: "idle", lastCheckAt: null });
    expect(mem.saved()).toMatchObject({ retryAt: T0 + NETWORK_RETRY_DELAY_MS });
  });
  test("state saved by an older build without retryAt is honoured", async () => {
    const { store, net } = setup({ stored: { auto: true, lastCheckAt: null, skipped: null } });
    expect(await store.checkAuto()).toBe("checked");
    expect(net.calls).toHaveLength(1);
  });
  test("a rate limit is silent but is not retried immediately", async () => {
    const { store, mem } = setup({ replies: [status(429)] });
    await store.checkAuto();
    expect(store.getState()).toMatchObject({ status: "idle", errorReason: null, lastCheckAt: T0 });
    expect(mem.saved()?.lastCheckAt).toBe(T0);
  });
  test("waits for the load before deciding", async () => {
    const { store, net } = setup({ stored: { auto: false, lastCheckAt: null, skipped: null } });
    expect(await store.checkAuto()).toBe("disabled");
    expect(net.calls).toHaveLength(0);
  });
  test("a concurrent auto check is refused while one is in flight", async () => {
    const { store, net } = setup();
    const [a, b] = await Promise.all([store.checkAuto(), store.checkAuto()]);
    expect([a, b].sort()).toEqual(["busy", "checked"]);
    expect(net.calls).toHaveLength(1);
  });
});

describe("checkNow", () => {
  test("shows checking, then reports an available release and opens the prompt", async () => {
    const { store } = setup();
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getState().status));
    expect(await store.checkNow()).toBe("available");
    expect(seen).toContain("checking");
    expect(store.getState()).toMatchObject({ status: "available", promptOpen: true });
  });
  test("ignores the throttle, the skip and an earlier Later", async () => {
    const { store, net } = setup({ stored: { auto: true, lastCheckAt: T0, skipped: "1.0.7" } });
    await store.checkNow();
    expect(net.calls).toHaveLength(1);
    expect(store.getState().promptOpen).toBe(true);
    store.dismiss();
    await store.checkNow();
    expect(store.getState().promptOpen).toBe(true);
  });
  test("works even when the automatic check is off", async () => {
    const { store, net } = setup({ stored: { auto: false, lastCheckAt: null, skipped: null } });
    await store.checkNow();
    expect(net.calls).toHaveLength(1);
  });
  test("reports up to date, also for 404 and clears a stale release", async () => {
    const { store } = setup({ replies: [ok("1.0.7"), status(404)] });
    await store.checkNow();
    store.dismiss();
    expect(await store.checkNow()).toBe("up-to-date");
    expect(store.getState()).toMatchObject({ release: null, promptOpen: false, errorReason: null });
  });
  test("an equal version is up to date", async () => {
    const { store } = setup({ current: "1.0.7" });
    expect(await store.checkNow()).toBe("up-to-date");
  });
  test.each([
    ["network", fail, false],
    ["network", status(502), false],
    ["rate-limited", status(403), true],
    ["invalid", async () => reply(200, { tag_name: "nope" }), true],
  ] as const)("reports the %s error", async (reason, responder, savesTime) => {
    const { store, mem } = setup({ replies: [responder] });
    expect(await store.checkNow()).toBe("error");
    expect(store.getState()).toMatchObject({ status: "error", errorReason: reason, promptOpen: false });
    expect(store.getState().lastCheckAt).toBe(savesTime ? T0 : null);
    expect(mem.saved()?.lastCheckAt ?? null).toBe(savesTime ? T0 : null);
  });
  test("a manual check ignores the retry delay and a failed one schedules it", async () => {
    const { store, mem, net } = setup({ replies: [fail, ok("1.0.7")] });
    await store.checkNow();
    expect(mem.saved()).toMatchObject({ retryAt: T0 + NETWORK_RETRY_DELAY_MS });
    expect(await store.checkAuto()).toBe("throttled");
    expect(await store.checkNow()).toBe("available");
    expect(net.calls).toHaveLength(2);
    expect(mem.saved()?.retryAt).toBeNull();
  });
  test("a rate limit does not schedule a network retry", async () => {
    const { store, mem } = setup({ replies: [status(429)] });
    await store.checkAuto();
    expect(mem.saved()?.retryAt ?? null).toBeNull();
  });
  test("a new check clears the previous error", async () => {
    const { store } = setup({ replies: [fail, ok("1.0.7")] });
    await store.checkNow();
    await store.checkNow();
    expect(store.getState()).toMatchObject({ status: "available", errorReason: null });
  });
  test("only one request is in flight; concurrent manual checks share it", async () => {
    const { store, net } = setup();
    const [a, b] = await Promise.all([store.checkNow(), store.checkNow()]);
    expect([a, b]).toEqual(["available", "available"]);
    expect(net.calls).toHaveLength(1);
  });
  test("a manual check during an auto check takes over and reports the result", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { store, net } = setup({ replies: [async () => { await gate; throw new TypeError("offline"); }] });
    const auto = store.checkAuto();
    while (net.calls.length === 0) await new Promise(resolve => setTimeout(resolve, 0));
    const manual = store.checkNow();
    release();
    await Promise.all([auto, manual]);
    expect(net.calls).toHaveLength(1);
    expect(store.getState()).toMatchObject({ status: "error", errorReason: "network" });
  });
  test("a manual check that starts while one is already manual keeps the checking state", async () => {
    const { store } = setup();
    const first = store.checkNow();
    const second = store.checkNow();
    await Promise.all([first, second]);
    expect(store.getState().status).toBe("available");
  });
});

describe("persistence actions", () => {
  test("setAuto persists and updates the state", async () => {
    const { store, mem } = setup();
    expect(await store.setAuto(false)).toEqual({ ok: true });
    expect(store.getState().auto).toBe(false);
    expect(mem.saved()).toMatchObject({ auto: false });
  });
  test("setAuto keeps the in-memory value when the write fails", async () => {
    const { store } = setup({ failWrite: true });
    expect(await store.setAuto(false)).toEqual({ ok: false, reason: "write-failed" });
    expect(store.getState().auto).toBe(false);
  });
  test("a failed write does not break the check flow", async () => {
    const { store } = setup({ failWrite: true });
    expect(await store.checkNow()).toBe("available");
    expect(store.getState()).toMatchObject({ promptOpen: true, lastCheckAt: T0 });
  });
  test("skip closes the prompt and the version stays skipped in the next session", async () => {
    const { store, mem, net } = setup();
    await store.checkAuto();
    expect(await store.skip()).toEqual({ ok: true });
    expect(store.getState().promptOpen).toBe(false);
    expect(mem.saved()?.skipped).toBe("1.0.7");
    const next = createUpdateStore({ storage: mem.storage, fetchFn: net.fetchFn, currentVersion: "1.0.6", now: () => T0 + AUTO_CHECK_INTERVAL_MS });
    await next.checkAuto();
    expect(next.getState()).toMatchObject({ status: "available", promptOpen: false });
  });
  test("skip without a release writes nothing", async () => {
    const { store, mem } = setup();
    expect(await store.skip()).toEqual({ ok: true });
    expect(mem.counts.writes).toBe(0);
  });
  test("skip before load() completes writes nothing and does not clobber the stored state", async () => {
    const { store, mem } = setup({ stored: { auto: false, lastCheckAt: 5, skipped: "1.0.5" } });
    const pending = store.skip();
    expect(await pending).toEqual({ ok: true });
    await store.load();
    expect(mem.counts.writes).toBe(0);
    expect(store.getState()).toMatchObject({ auto: false, lastCheckAt: 5 });
    expect(mem.saved()).toMatchObject({ skipped: "1.0.5" });
  });
  test("a failed skip reports the failure, keeps the prompt open and does not leave the version skipped", async () => {
    const { store, mem } = setup();
    await store.checkAuto();
    mem.flags.failWrite = true;
    expect(await store.skip()).toEqual({ ok: false, reason: "write-failed" });
    expect(store.getState().promptOpen).toBe(true);
    mem.flags.failWrite = false;
    await store.setAuto(true);
    expect(mem.saved()?.skipped ?? null).toBeNull();
  });
  test("a skip that succeeds after a failed one closes the prompt", async () => {
    const { store, mem } = setup();
    await store.checkAuto();
    mem.flags.failWrite = true;
    await store.skip();
    mem.flags.failWrite = false;
    expect(await store.skip()).toEqual({ ok: true });
    expect(store.getState().promptOpen).toBe(false);
    expect(mem.saved()?.skipped).toBe("1.0.7");
  });
  test("writes are serialized and the last state wins", async () => {
    const { store, mem } = setup();
    await Promise.all([store.setAuto(false), store.setAuto(true), store.setAuto(false)]);
    expect(mem.saved()?.auto).toBe(false);
  });
});

describe("dismiss", () => {
  test("with no prompt open it changes nothing and does not suppress a later prompt", async () => {
    const { store } = setup();
    const before = store.getState();
    store.dismiss();
    expect(store.getState()).toBe(before);
    await store.checkAuto();
    expect(store.getState().promptOpen).toBe(true);
  });
  test("a second dismiss is a no-op", async () => {
    const { store } = setup();
    await store.checkAuto();
    store.dismiss();
    const after = store.getState();
    store.dismiss();
    expect(store.getState()).toBe(after);
  });
});

describe("overlapping checks while the result is being persisted", () => {
  async function waitUntil(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 200 && !condition(); i++) await new Promise(resolve => setTimeout(resolve, 0));
    if (!condition()) throw new Error("condition never became true");
  }
  function gatedSetup() {
    let open: () => void = () => {};
    const gate = new Promise<void>(resolve => { open = resolve; });
    const started = { count: 0 };
    const wrap = (inner: KeyValueStorage): KeyValueStorage => ({
      getItem: inner.getItem,
      setItem: async (key, value) => { started.count++; await gate; await inner.setItem(key, value); },
    });
    return { ...setup({ wrap }), open: () => open(), started };
  }
  test("a second automatic check is busy until the first one has finished writing", async () => {
    const { store, net, open, started } = gatedSetup();
    const first = store.checkAuto();
    await waitUntil(() => started.count > 0);
    expect(store.getState().status).toBe("available");
    expect(await store.checkAuto()).toBe("busy");
    open();
    expect(await first).toBe("checked");
    expect(await store.checkAuto()).toBe("throttled");
    expect(net.calls).toHaveLength(1);
  });
  test("a manual check that arrives while the write is pending runs its own request afterwards", async () => {
    const { store, net, open, started } = gatedSetup();
    const first = store.checkAuto();
    await waitUntil(() => started.count > 0);
    const manual = store.checkNow();
    await waitUntil(() => store.getState().status === "checking");
    open();
    await Promise.all([first, manual]);
    expect(net.calls).toHaveLength(2);
    expect(store.getState().status).toBe("available");
  });
});

describe("the prompt rule is shared with shouldPrompt", () => {
  const versions = ["1.0.5", "1.0.6", "1.0.7", "1.1"];
  const skips = [null, "1.0.7", "1.1"];
  test("an automatic check opens the prompt exactly when shouldPrompt says so", async () => {
    let compared = 0;
    for (const current of versions) for (const version of versions) for (const skipped of skips) {
      const { store } = setup({ current, replies: [ok(version)], stored: { auto: true, lastCheckAt: null, skipped } });
      await store.checkAuto();
      expect(store.getState().promptOpen).toBe(shouldPrompt({ current, release: { version }, skipped }));
      compared++;
    }
    expect(compared).toBe(versions.length * versions.length * skips.length);
  });
});

describe("openPrompt", () => {
  test("re-opens the prompt for an available release only", async () => {
    const { store } = setup();
    store.openPrompt();
    expect(store.getState().promptOpen).toBe(false);
    await store.checkAuto();
    store.dismiss();
    store.openPrompt();
    expect(store.getState().promptOpen).toBe(true);
  });
});

describe("state shape", () => {
  test("exposes exactly the documented fields", () => {
    const keys: Array<keyof UpdateStoreState> = ["status", "release", "errorReason", "auto", "lastCheckAt", "promptOpen"];
    expect(Object.keys(setup().store.getState()).sort()).toEqual([...keys].sort());
  });
});
