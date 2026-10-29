import { z } from "zod";
import { dateKey } from "./planner";
import { fillPlaceholders } from "./text-template";
import type { KeyValueStorage } from "./task-storage";

export const OTA_STORAGE_KEY = "dayform.ota.v1";
const HOUR_MS = 60 * 60 * 1000;
/** Automatic checks run at most this often (a manual check ignores it). */
export const OTA_MIN_INTERVAL_MS = 12 * HOUR_MS;
/** After a failed automatic check the next one waits this long, so foreground events do not hammer the network. */
export const OTA_RETRY_DELAY_MS = 15 * 60 * 1000;
/** How long the app has to be open (or back in the foreground) before an automatic check starts. */
export const OTA_IDLE_DELAY_MS = 4000;
const SHORT_ID_LENGTH = 8;

export type OtaStatus = "idle" | "checking" | "downloading" | "ready" | "upToDate" | "unsupported" | "error";
/** Which step failed. Only used to pick a generic message: raw error text is never kept. */
export type OtaErrorKind = "check" | "download";
export type OtaCurrent = { updateId: string | null; createdAt: Date | null; isEmbedded: boolean };

/** Thin port over expo-updates (see lib/ota-expo.ts). Every method may throw: the checker never lets that escape. */
export type OtaAdapter = {
  isEnabled(): boolean;
  check(): Promise<{ available: boolean }>;
  fetch(): Promise<{ ok: boolean }>;
  current(): OtaCurrent;
};

export type OtaState = {
  status: OtaStatus;
  errorKind: OtaErrorKind | null;
  /** Epoch ms of the last check that reached the server. */
  lastCheckAt: number | null;
};

/** "ready" means a downloaded update waits for the next launch (nothing is ever reloaded while the app is in use). */
export type OtaAutoResult = "unsupported" | "ready" | "busy" | "throttled" | "checked";

export type OtaChecker = {
  getState(): OtaState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  checkAuto(): Promise<OtaAutoResult>;
  /** Ignores the throttle, joins a check that is already running; resolves to the resulting status. */
  checkNow(): Promise<OtaStatus>;
  current(): OtaCurrent;
};

export type OtaCheckerDeps = {
  adapter: OtaAdapter;
  storage: KeyValueStorage;
  now: () => number;
  minIntervalMs?: number;
  retryDelayMs?: number;
};

// --- Persisted state -------------------------------------------------------------------------------------------
const storedSchema = z.object({ lastCheckAt: z.number().finite().min(0).nullable().catch(null) });

/** Never writes: a missing, invalid or unreadable value just means "never checked". */
async function loadLastCheckAt(storage: KeyValueStorage): Promise<number | null> {
  try {
    const raw = await storage.getItem(OTA_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.lastCheckAt : null;
  } catch {
    return null;
  }
}

/** A failed write is ignored: the check simply runs again sooner. */
async function saveLastCheckAt(storage: KeyValueStorage, lastCheckAt: number): Promise<void> {
  try {
    await storage.setItem(OTA_STORAGE_KEY, JSON.stringify({ lastCheckAt }));
  } catch {
    // Not fatal: the in-memory value still throttles this session.
  }
}

// --- Display helpers -------------------------------------------------------------------------------------------
export type CurrentUpdate = { kind: "embedded" } | { kind: "update"; shortId: string; date: string | null };

/** The build's own content (also when the id is unknown) or "update <short id> from <date>". */
export function describeCurrent(current: OtaCurrent): CurrentUpdate {
  const id = current.updateId?.trim() ?? "";
  if (current.isEmbedded || id === "") return { kind: "embedded" };
  const createdAt = current.createdAt;
  const date = createdAt instanceof Date && !Number.isNaN(createdAt.getTime()) ? dateKey(createdAt) : null;
  return { kind: "update", shortId: id.slice(0, SHORT_ID_LENGTH), date };
}

type Translate = (text: string) => string;

/** Already translated text for the "current content" line. */
export function currentUpdateLabel(info: CurrentUpdate, t: Translate): string {
  if (info.kind === "embedded") return t("Built-in content");
  if (info.date === null) return fillPlaceholders(t("Update {id}"), { id: info.shortId });
  return fillPlaceholders(t("Update {id} from {date}"), { id: info.shortId, date: info.date });
}

/** Already translated status line, or null when there is nothing to say yet. */
export function otaStatusLine(state: Pick<OtaState, "status" | "errorKind">, t: Translate): string | null {
  switch (state.status) {
    case "checking": return t("Checking...");
    case "downloading": return t("Downloading...");
    case "ready": return t("Ready: applies the next time you open the app");
    case "upToDate": return t("Up to date");
    case "unsupported": return t("Content updates are not available in this build.");
    case "error": return t(state.errorKind === "download"
      ? "Could not download new content. Try again later."
      : "Could not check for new content. Try again later.");
    default: return null;
  }
}

// --- Checker ---------------------------------------------------------------------------------------------------
function readEnabled(adapter: OtaAdapter): boolean {
  try {
    return adapter.isEnabled() === true;
  } catch {
    return false;
  }
}

const NO_CURRENT: OtaCurrent = { updateId: null, createdAt: null, isEmbedded: true };

export function createOtaChecker(deps: OtaCheckerDeps): OtaChecker {
  const { adapter, storage, now, minIntervalMs = OTA_MIN_INTERVAL_MS, retryDelayMs = OTA_RETRY_DELAY_MS } = deps;
  const supported = readEnabled(adapter);
  const listeners = new Set<() => void>();
  let state: OtaState = { status: supported ? "idle" : "unsupported", errorKind: null, lastCheckAt: null };
  let retryAt: number | null = null;
  let loading: Promise<void> | null = null;
  let job: Promise<void> | null = null;

  function setState(patch: Partial<OtaState>): void {
    const next = { ...state, ...patch };
    if (next.status === state.status && next.errorKind === state.errorKind && next.lastCheckAt === state.lastCheckAt) return;
    state = next;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A faulty subscriber must not break the check.
      }
    }
  }

  function load(): Promise<void> {
    loading ??= loadLastCheckAt(storage).then(stored => {
      if (state.lastCheckAt === null) setState({ lastCheckAt: stored });
    });
    return loading;
  }

  function isDue(): boolean {
    const current = now();
    if (retryAt !== null && current < retryAt) return false;
    const last = state.lastCheckAt;
    // A clock that went backwards must not silence the check until the old time is reached again.
    return last === null || current < last || current - last >= minIntervalMs;
  }

  function fail(errorKind: OtaErrorKind): void {
    retryAt = now() + retryDelayMs;
    setState({ status: "error", errorKind });
  }

  async function runSteps(): Promise<void> {
    setState({ status: "checking", errorKind: null });
    let available: boolean;
    try {
      available = (await adapter.check()).available === true;
    } catch {
      fail("check");
      return;
    }
    if (!available) {
      const checkedAt = now();
      retryAt = null;
      setState({ status: "upToDate", errorKind: null, lastCheckAt: checkedAt });
      await saveLastCheckAt(storage, checkedAt);
      return;
    }
    setState({ status: "downloading" });
    let downloaded: boolean;
    try {
      downloaded = (await adapter.fetch()).ok === true;
    } catch {
      downloaded = false;
    }
    if (!downloaded) {
      fail("download");
      return;
    }
    const checkedAt = now();
    retryAt = null;
    setState({ status: "ready", errorKind: null, lastCheckAt: checkedAt });
    await saveLastCheckAt(storage, checkedAt);
  }

  /** Registers the job synchronously, so callers that look at `job` right after an await cannot start a second one.
   *  runSteps cannot reject: adapter calls are guarded, storage errors are swallowed and listeners are isolated. */
  function start(): Promise<void> {
    const running = runSteps().finally(() => { job = null; });
    job = running;
    return running;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load,
    async checkAuto() {
      await load();
      if (!supported) return "unsupported";
      if (state.status === "ready") return "ready";
      if (job) return "busy";
      if (!isDue()) return "throttled";
      await start();
      return "checked";
    },
    async checkNow() {
      await load();
      if (!supported || state.status === "ready") return state.status;
      await (job ?? start());
      return state.status;
    },
    current() {
      try {
        return adapter.current();
      } catch {
        return NO_CURRENT;
      }
    },
  };
}
