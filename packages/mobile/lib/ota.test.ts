import { describe, test, expect } from "bun:test";
import {
  OTA_MIN_INTERVAL_MS,
  OTA_RETRY_DELAY_MS,
  OTA_STORAGE_KEY,
  createOtaChecker,
  currentUpdateLabel,
  describeCurrent,
  otaStatusLine,
  type OtaAdapter,
  type OtaCurrent,
} from "./ota";
import { extraTranslations } from "./i18n";
import type { KeyValueStorage } from "./task-storage";

function memoryStorage(initial: Record<string, string> = {}, opts: { failGet?: boolean; failSet?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  const storage: KeyValueStorage = {
    getItem: async key => {
      if (opts.failGet) throw new Error("read failed");
      return data.get(key) ?? null;
    },
    setItem: async (key, value) => {
      if (opts.failSet) throw new Error("write failed");
      data.set(key, value);
    },
  };
  return { storage, data };
}

type FakeOptions = {
  enabled?: boolean | "throws";
  check?: () => Promise<{ available: boolean }>;
  fetch?: () => Promise<{ ok: boolean }>;
  current?: () => OtaCurrent;
};

function fakeAdapter(options: FakeOptions = {}) {
  const calls = { check: 0, fetch: 0 };
  const adapter: OtaAdapter = {
    isEnabled: () => {
      if (options.enabled === "throws") throw new Error("boom");
      return options.enabled ?? true;
    },
    check: async () => { calls.check += 1; return (options.check ?? (async () => ({ available: false })))(); },
    fetch: async () => { calls.fetch += 1; return (options.fetch ?? (async () => ({ ok: true })))(); },
    current: options.current ?? (() => ({ updateId: null, createdAt: null, isEmbedded: true })),
  };
  return { adapter, calls };
}

function clock(start = 1_000_000) {
  let value = start;
  return { now: () => value, advance: (ms: number) => { value += ms; } };
}

function setup(options: FakeOptions = {}, stored: Record<string, string> = {}, storageOpts = {}) {
  const fake = fakeAdapter(options);
  const mem = memoryStorage(stored, storageOpts);
  const time = clock();
  const checker = createOtaChecker({ adapter: fake.adapter, storage: mem.storage, now: time.now });
  return { ...fake, ...mem, time, checker };
}

describe("unsupported builds", () => {
  test("never touch the adapter or storage when expo-updates is disabled", async () => {
    const { checker, calls, data } = setup({ enabled: false });
    expect(checker.getState().status).toBe("unsupported");
    expect(await checker.checkAuto()).toBe("unsupported");
    expect(await checker.checkNow()).toBe("unsupported");
    expect(calls).toEqual({ check: 0, fetch: 0 });
    expect(data.size).toBe(0);
  });

  test("an isEnabled that throws counts as unsupported", async () => {
    const { checker } = setup({ enabled: "throws" });
    expect(await checker.checkNow()).toBe("unsupported");
  });
});

describe("check flow", () => {
  test("starts idle", () => {
    expect(setup().checker.getState()).toEqual({ status: "idle", errorKind: null, lastCheckAt: null });
  });

  test("nothing new: checking, then upToDate with the time stored", async () => {
    const { checker, data, time, calls } = setup();
    const seen: string[] = [];
    checker.subscribe(() => seen.push(checker.getState().status));
    expect(await checker.checkAuto()).toBe("checked");
    expect(seen).toEqual(["checking", "upToDate"]);
    expect(checker.getState()).toEqual({ status: "upToDate", errorKind: null, lastCheckAt: time.now() });
    expect(JSON.parse(data.get(OTA_STORAGE_KEY)!)).toEqual({ lastCheckAt: time.now() });
    expect(calls).toEqual({ check: 1, fetch: 0 });
  });

  test("new content: checking, downloading, ready", async () => {
    const { checker, calls, time } = setup({ check: async () => ({ available: true }) });
    const seen: string[] = [];
    checker.subscribe(() => seen.push(checker.getState().status));
    expect(await checker.checkNow()).toBe("ready");
    expect(seen).toEqual(["checking", "downloading", "ready"]);
    expect(checker.getState().lastCheckAt).toBe(time.now());
    expect(calls).toEqual({ check: 1, fetch: 1 });
  });

  test("once ready, no further network call happens this session", async () => {
    const { checker, calls, time } = setup({ check: async () => ({ available: true }) });
    await checker.checkNow();
    time.advance(OTA_MIN_INTERVAL_MS * 2);
    expect(await checker.checkAuto()).toBe("ready");
    expect(await checker.checkNow()).toBe("ready");
    expect(calls).toEqual({ check: 1, fetch: 1 });
  });

  test("unsubscribe stops notifications and a faulty subscriber does not break the check", async () => {
    const { checker } = setup();
    let count = 0;
    const off = checker.subscribe(() => { count += 1; });
    checker.subscribe(() => { throw new Error("bad listener"); });
    await checker.checkNow();
    const afterFirst = count;
    off();
    await checker.checkNow();
    expect(afterFirst).toBe(2);
    expect(count).toBe(afterFirst);
    expect(checker.getState().status).toBe("upToDate");
  });
});

describe("throttle", () => {
  test("automatic checks wait 12 hours, a manual check does not", async () => {
    const { checker, calls, time } = setup();
    expect(await checker.checkAuto()).toBe("checked");
    time.advance(OTA_MIN_INTERVAL_MS - 1);
    expect(await checker.checkAuto()).toBe("throttled");
    expect(calls.check).toBe(1);
    await checker.checkNow();
    expect(calls.check).toBe(2);
    time.advance(OTA_MIN_INTERVAL_MS);
    expect(await checker.checkAuto()).toBe("checked");
    expect(calls.check).toBe(3);
  });

  test("the persisted timestamp throttles across launches", async () => {
    const first = setup();
    await first.checker.checkAuto();
    const second = setup({}, { [OTA_STORAGE_KEY]: first.data.get(OTA_STORAGE_KEY)! });
    expect(await second.checker.checkAuto()).toBe("throttled");
    expect(second.calls.check).toBe(0);
  });

  test("an old stored timestamp is due again", async () => {
    const { checker, calls, time } = setup({}, { [OTA_STORAGE_KEY]: JSON.stringify({ lastCheckAt: 1_000_000 - OTA_MIN_INTERVAL_MS }) });
    time.advance(0);
    expect(await checker.checkAuto()).toBe("checked");
    expect(calls.check).toBe(1);
  });

  test("a timestamp from the future (clock moved back) does not block checks", async () => {
    const { checker } = setup({}, { [OTA_STORAGE_KEY]: JSON.stringify({ lastCheckAt: 9_999_999_999 }) });
    expect(await checker.checkAuto()).toBe("checked");
  });

  test("a failed automatic check backs off for 15 minutes, then tries again", async () => {
    let fail = true;
    const { checker, calls, time, data } = setup({ check: async () => { if (fail) throw new Error("offline"); return { available: false }; } });
    expect(await checker.checkAuto()).toBe("checked");
    expect(data.has(OTA_STORAGE_KEY)).toBe(false);
    time.advance(OTA_RETRY_DELAY_MS - 1);
    expect(await checker.checkAuto()).toBe("throttled");
    fail = false;
    time.advance(1);
    expect(await checker.checkAuto()).toBe("checked");
    expect(calls.check).toBe(2);
    expect(checker.getState().status).toBe("upToDate");
  });

  test("a manual check works during the back-off and a success clears it", async () => {
    let fail = true;
    const { checker, time } = setup({ check: async () => { if (fail) throw new Error("offline"); return { available: false }; } });
    await checker.checkAuto();
    fail = false;
    expect(await checker.checkNow()).toBe("upToDate");
    time.advance(OTA_MIN_INTERVAL_MS - 1);
    expect(await checker.checkAuto()).toBe("throttled");
  });
});

describe("failures never throw", () => {
  test("a failing check becomes the generic check error", async () => {
    const { checker } = setup({ check: async () => { throw new Error("secret detail"); } });
    expect(await checker.checkNow()).toBe("error");
    expect(checker.getState()).toEqual({ status: "error", errorKind: "check", lastCheckAt: null });
  });

  test("a synchronous throw inside the adapter is handled too", async () => {
    const { adapter } = fakeAdapter();
    const broken: OtaAdapter = { ...adapter, check: () => { throw new Error("sync"); } };
    const checker = createOtaChecker({ adapter: broken, storage: memoryStorage().storage, now: clock().now });
    expect(await checker.checkNow()).toBe("error");
  });

  test("a failing download keeps the time unsaved and reports the download error", async () => {
    const { checker, data } = setup({ check: async () => ({ available: true }), fetch: async () => { throw new Error("net"); } });
    expect(await checker.checkNow()).toBe("error");
    expect(checker.getState().errorKind).toBe("download");
    expect(data.has(OTA_STORAGE_KEY)).toBe(false);
  });

  test("a download that reports not ok is an error", async () => {
    const { checker } = setup({ check: async () => ({ available: true }), fetch: async () => ({ ok: false }) });
    expect(await checker.checkNow()).toBe("error");
    expect(checker.getState().errorKind).toBe("download");
  });

  test("an error clears on the next successful check", async () => {
    let fail = true;
    const { checker } = setup({ check: async () => { if (fail) throw new Error("x"); return { available: false }; } });
    await checker.checkNow();
    fail = false;
    expect(await checker.checkNow()).toBe("upToDate");
    expect(checker.getState().errorKind).toBeNull();
  });

  test("storage read and write failures do not break checking", async () => {
    const { checker } = setup({}, {}, { failGet: true, failSet: true });
    expect(await checker.checkAuto()).toBe("checked");
    expect(checker.getState().status).toBe("upToDate");
  });

  test("a corrupt stored value means never checked", async () => {
    for (const raw of ["not json", "[]", JSON.stringify({ lastCheckAt: "yesterday" }), JSON.stringify({ lastCheckAt: -5 })]) {
      const { checker, calls } = setup({}, { [OTA_STORAGE_KEY]: raw });
      expect(await checker.checkAuto()).toBe("checked");
      expect(calls.check).toBe(1);
    }
  });
});

describe("concurrency", () => {
  test("simultaneous automatic and manual calls share one adapter check", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { checker, calls } = setup({ check: async () => { await gate; return { available: false }; } });
    const auto = checker.checkAuto();
    const manual = checker.checkNow();
    const second = checker.checkNow();
    await Promise.resolve();
    release();
    expect(await Promise.all([auto, manual, second])).toEqual(["checked", "upToDate", "upToDate"]);
    expect(calls.check).toBe(1);
  });

  test("an automatic call during a running check reports busy", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { checker, calls } = setup({ check: async () => { await gate; return { available: false }; } });
    const running = checker.checkNow();
    await checker.load();
    expect(await checker.checkAuto()).toBe("busy");
    expect(checker.getState().status).toBe("checking");
    release();
    await running;
    expect(calls.check).toBe(1);
  });

  test("load is idempotent and does not overwrite a newer in-memory time", async () => {
    const { checker, time } = setup({}, { [OTA_STORAGE_KEY]: JSON.stringify({ lastCheckAt: 5 }) });
    await Promise.all([checker.load(), checker.load()]);
    expect(checker.getState().lastCheckAt).toBe(5);
    await checker.checkNow();
    await checker.load();
    expect(checker.getState().lastCheckAt).toBe(time.now());
  });
});

describe("current()", () => {
  test("returns the adapter value, or the embedded fallback when the adapter throws", () => {
    const value: OtaCurrent = { updateId: "abc", createdAt: new Date(0), isEmbedded: false };
    expect(setup({ current: () => value }).checker.current()).toBe(value);
    expect(setup({ current: () => { throw new Error("x"); } }).checker.current())
      .toEqual({ updateId: null, createdAt: null, isEmbedded: true });
  });
});

describe("describeCurrent", () => {
  test("the embedded build, or an unknown id, is built-in content", () => {
    expect(describeCurrent({ updateId: "abc", createdAt: null, isEmbedded: true })).toEqual({ kind: "embedded" });
    expect(describeCurrent({ updateId: null, createdAt: null, isEmbedded: false })).toEqual({ kind: "embedded" });
    expect(describeCurrent({ updateId: "  ", createdAt: null, isEmbedded: false })).toEqual({ kind: "embedded" });
  });

  test("an update shows the first 8 characters of its id and the local date", () => {
    const createdAt = new Date(2026, 4, 7, 23, 30);
    expect(describeCurrent({ updateId: "0f8fad5b-d9cb-469f", createdAt, isEmbedded: false }))
      .toEqual({ kind: "update", shortId: "0f8fad5b", date: "2026-05-07" });
  });

  test("a missing or invalid date is left out", () => {
    expect(describeCurrent({ updateId: "abc", createdAt: null, isEmbedded: false })).toEqual({ kind: "update", shortId: "abc", date: null });
    expect(describeCurrent({ updateId: "abc", createdAt: new Date(Number.NaN), isEmbedded: false }).kind).toBe("update");
    expect(describeCurrent({ updateId: "abc", createdAt: new Date(Number.NaN), isEmbedded: false })).toMatchObject({ date: null });
  });
});

describe("labels", () => {
  const identity = (text: string) => text;
  const vi = (text: string) => extraTranslations[text] ?? text;

  test("current update label in English and Vietnamese", () => {
    expect(currentUpdateLabel({ kind: "embedded" }, identity)).toBe("Built-in content");
    expect(currentUpdateLabel({ kind: "update", shortId: "0f8fad5b", date: "2026-05-07" }, identity)).toBe("Update 0f8fad5b from 2026-05-07");
    expect(currentUpdateLabel({ kind: "update", shortId: "0f8fad5b", date: null }, identity)).toBe("Update 0f8fad5b");
    expect(currentUpdateLabel({ kind: "update", shortId: "0f8fad5b", date: "2026-05-07" }, vi)).toBe("Bản cập nhật 0f8fad5b ngày 2026-05-07");
  });

  test("status lines cover every state and all have a Vietnamese translation", () => {
    const states = [
      { status: "idle", errorKind: null },
      { status: "checking", errorKind: null },
      { status: "downloading", errorKind: null },
      { status: "ready", errorKind: null },
      { status: "upToDate", errorKind: null },
      { status: "unsupported", errorKind: null },
      { status: "error", errorKind: "check" },
      { status: "error", errorKind: "download" },
      { status: "error", errorKind: null },
    ] as const;
    expect(otaStatusLine(states[0], identity)).toBeNull();
    for (const state of states.slice(1)) {
      const english = otaStatusLine(state, identity)!;
      expect(english.length).toBeGreaterThan(0);
      expect(otaStatusLine(state, vi)).not.toBe(english);
    }
    expect(otaStatusLine({ status: "error", errorKind: "download" }, identity)).toBe("Could not download new content. Try again later.");
    expect(otaStatusLine({ status: "error", errorKind: null }, identity)).toBe("Could not check for new content. Try again later.");
  });

  test("every UI string used by the OTA block has a Vietnamese entry", () => {
    for (const key of ["App content", "Check now", "Update app content automatically",
      "Checks the Dayform update server for new content. No task data is sent."]) {
      expect(extraTranslations[key]).toBeTruthy();
    }
  });
});
