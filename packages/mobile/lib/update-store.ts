import {
  NETWORK_RETRY_DELAY_MS,
  fetchLatestRelease,
  isNewer,
  shouldAutoCheck,
  shouldPrompt,
  type FetchErrorReason,
  type FetchLike,
  type FetchResult,
  type Release,
} from "./update-check";
import {
  DEFAULT_UPDATE_STATE,
  loadUpdateState,
  saveUpdateState,
  type SaveUpdateStateResult,
  type UpdateState,
} from "./update-state";
import type { KeyValueStorage } from "./task-storage";

export type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "error";

export type UpdateStoreState = {
  status: UpdateStatus;
  release: Release | null;
  errorReason: FetchErrorReason | null;
  auto: boolean;
  lastCheckAt: number | null;
  promptOpen: boolean;
};

export type CheckAutoResult = "disabled" | "throttled" | "busy" | "checked";

export type UpdateStoreDeps = {
  storage: KeyValueStorage;
  fetchFn: FetchLike;
  currentVersion: string;
  now: () => number;
  timeoutMs?: number;
};

export type UpdateStore = {
  getState(): UpdateStoreState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  checkAuto(): Promise<CheckAutoResult>;
  checkNow(): Promise<UpdateStatus>;
  setAuto(auto: boolean): Promise<SaveUpdateStateResult>;
  /** "Later": closes the prompt; the same version is not offered again automatically until the app restarts. */
  dismiss(): void;
  /** "Skip this version": remembers the version, then closes the prompt. On a write failure the prompt stays open. */
  skip(): Promise<SaveUpdateStateResult>;
  /** Re-opens the prompt for an available release (Settings status line). */
  openPrompt(): void;
};

/** Never mutated: a change (manual takeover, saving phase) replaces the object. */
type Job = { readonly manual: boolean; readonly phase: "fetching" | "saving"; readonly promise: Promise<void> };

const INITIAL_STATE: UpdateStoreState = {
  status: "idle",
  release: null,
  errorReason: null,
  auto: DEFAULT_UPDATE_STATE.auto,
  lastCheckAt: DEFAULT_UPDATE_STATE.lastCheckAt,
  promptOpen: false,
};

export function createUpdateStore(deps: UpdateStoreDeps): UpdateStore {
  const { storage, fetchFn, currentVersion, now, timeoutMs } = deps;
  const listeners = new Set<() => void>();
  let state = INITIAL_STATE;
  let persisted: UpdateState = DEFAULT_UPDATE_STATE;
  let dismissedVersion: string | null = null;
  let loading: Promise<void> | null = null;
  let job: Job | null = null;
  let writes: Promise<unknown> = Promise.resolve();

  function setState(patch: Partial<UpdateStoreState>): void {
    const next = { ...state, ...patch };
    if ((Object.keys(next) as Array<keyof UpdateStoreState>).every(key => next[key] === state[key])) return;
    state = next;
    for (const listener of [...listeners]) listener();
  }

  /** Writes are queued; each one saves the latest snapshot, so the last call always wins. */
  function persist(patch: Partial<UpdateState>): Promise<SaveUpdateStateResult> {
    persisted = { ...persisted, ...patch };
    const result = writes.then(() => saveUpdateState(storage, persisted));
    writes = result;
    return result;
  }

  function load(): Promise<void> {
    loading ??= loadUpdateState(storage).then(loaded => {
      persisted = loaded;
      setState({ auto: loaded.auto, lastCheckAt: loaded.lastCheckAt });
    });
    return loading;
  }

  function reportRelease(release: Release | null, manual: boolean): Partial<UpdateStoreState> {
    if (!release || !isNewer(currentVersion, release)) {
      return { status: "up-to-date", release: null, errorReason: null, promptOpen: false };
    }
    const wanted = shouldPrompt({ current: currentVersion, release, skipped: persisted.skipped }) && dismissedVersion !== release.version;
    return { status: "available", release, errorReason: null, promptOpen: manual || wanted };
  }

  /**
   * A failed connection (including a 5xx) is not a completed check: only a retry time is stored, so foreground events
   * do not hammer the network. An answer from the server (even a refusal) counts as a check. A failed write is not
   * reported: the check simply runs again sooner.
   */
  async function finish(result: FetchResult, manual: boolean): Promise<void> {
    if (result.kind === "error") {
      if (manual) setState({ status: "error", errorReason: result.reason });
      if (result.reason === "network") {
        await persist({ retryAt: now() + NETWORK_RETRY_DELAY_MS });
        return;
      }
    }
    const checkedAt = now();
    const outcome = result.kind === "release" ? reportRelease(result.release, manual)
      : result.kind === "none" ? reportRelease(null, manual) : {};
    setState({ ...outcome, lastCheckAt: checkedAt });
    await persist({ lastCheckAt: checkedAt, retryAt: null });
  }

  /** Applies the result and keeps the job registered until the write has finished, so no second check can start. */
  async function settle(result: FetchResult, startedManual: boolean): Promise<void> {
    const manual = job?.manual ?? startedManual;
    if (job) job = { ...job, phase: "saving" };
    try {
      await finish(result, manual);
    } finally {
      job = null;
    }
  }

  function runCheck(manual: boolean): Promise<void> {
    if (job?.phase === "saving") {
      // The running check already reported; an explicit request gets a fresh one once it has finished writing.
      if (!manual) return job.promise;
      setState({ status: "checking", errorReason: null });
      return job.promise.then(() => runCheck(true));
    }
    if (job) {
      if (manual && !job.manual) {
        job = { ...job, manual: true };
        setState({ status: "checking", errorReason: null });
      }
      return job.promise;
    }
    if (manual) setState({ status: "checking", errorReason: null });
    const promise = fetchLatestRelease(fetchFn, { timeoutMs }).then(result => settle(result, manual));
    job = { manual, phase: "fetching", promise };
    return promise;
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
      if (!persisted.auto) return "disabled";
      if (job) return "busy";
      const due = shouldAutoCheck({ auto: persisted.auto, lastCheckAt: persisted.lastCheckAt, retryAt: persisted.retryAt, now: now() });
      if (!due) return "throttled";
      await runCheck(false);
      return "checked";
    },
    async checkNow() {
      await load();
      await runCheck(true);
      return state.status;
    },
    async setAuto(auto) {
      await load();
      setState({ auto });
      return persist({ auto });
    },
    dismiss() {
      if (!state.promptOpen) return;
      dismissedVersion = state.release?.version ?? null;
      setState({ promptOpen: false });
    },
    async skip() {
      const version = state.release?.version;
      if (!version) return { ok: true };
      const previous = persisted.skipped;
      const result = await persist({ skipped: version });
      if (!result.ok) {
        // Not saved: do not let a later successful write make the choice durable behind the user's back.
        if (persisted.skipped === version) persisted = { ...persisted, skipped: previous };
        return result;
      }
      if (state.release?.version === version) setState({ promptOpen: false });
      return result;
    },
    openPrompt() {
      if (state.release && state.status === "available") setState({ promptOpen: true });
    },
  };
}
