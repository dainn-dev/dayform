import {
  CYCLE_KEY,
  DEFAULT_CYCLE_STATE,
  acknowledge,
  addPeriod,
  mergeCycleState,
  parseCycleText,
  removePeriod,
  setEnabled,
  setPaused,
  setShowOnTimeline,
  updateDefaults,
  updateLock,
  updatePeriod,
  updateReminders,
  type CycleDefaults,
  type CycleFailure,
  type CycleLock,
  type CycleReminders,
  type CycleResult,
  type CycleState,
  type Period,
} from "./cycle";
import { dateKey } from "./planner";
import { contentKey, type KeyValueStorage } from "./task-storage";

export { CYCLE_KEY };
export const CYCLE_CORRUPT_PREFIX = "dayform.cycle.corrupt.";

export type CycleStoreState = {
  state: CycleState;
  /** True once the stored value was read (or the read failed and defaults apply). */
  ready: boolean;
  /** True while the latest attempt to persist failed; memory still holds the last value that was saved. */
  saveError: boolean;
  /** True when the stored value could not be read or safely copied: nothing is written until the next launch. */
  locked: boolean;
};

export type CycleActionResult = { ok: true } | { ok: false; reason: CycleFailure | "write-failed" | "locked" };

export type CycleStore = {
  getState(): CycleStoreState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  /** `today` defaults to the device's local date; tests and callers may pass it. */
  addPeriod(period: Period, today?: string): Promise<CycleActionResult>;
  /** Replaces the period that starts on `originalStart`. */
  updatePeriod(originalStart: string, next: Period, today?: string): Promise<CycleActionResult>;
  removePeriod(start: string): Promise<CycleActionResult>;
  setEnabled(enabled: boolean): Promise<CycleActionResult>;
  acknowledge(): Promise<CycleActionResult>;
  setPaused(paused: boolean): Promise<CycleActionResult>;
  updateDefaults(patch: Partial<CycleDefaults>): Promise<CycleActionResult>;
  updateReminders(patch: Partial<CycleReminders>): Promise<CycleActionResult>;
  updateLock(patch: Partial<CycleLock>): Promise<CycleActionResult>;
  setShowOnTimeline(show: boolean): Promise<CycleActionResult>;
  /** Applies the tracker data of a backup (`merge` keeps current settings, `replace` takes the file's). */
  importState(incoming: CycleState, mode: "merge" | "replace"): Promise<CycleActionResult>;
  /** Deletes everything the tracker holds: every setting goes back to its default. Not a restore: no file can do this. */
  reset(): Promise<CycleActionResult>;
  dispose(): void;
};

const settle = (): undefined => undefined;

type Deferred = { promise: Promise<void>; resolve: () => void };

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(res => { resolve = res; });
  return { promise, resolve };
}

type Read = { state: CycleState; locked: boolean };

async function copyAside(storage: KeyValueStorage, text: string): Promise<boolean> {
  try {
    await storage.setItem(contentKey(CYCLE_CORRUPT_PREFIX, text), text);
    return true;
  } catch {
    return false;
  }
}

/** Never writes the main key. Bad data is copied to a content-addressed corrupt key first; no copy means locked. */
async function readStored(storage: KeyValueStorage): Promise<Read> {
  let text: string | null;
  try {
    text = await storage.getItem(CYCLE_KEY);
  } catch {
    return { state: DEFAULT_CYCLE_STATE, locked: true };
  }
  if (text === null) return { state: DEFAULT_CYCLE_STATE, locked: false };
  const parsed = parseCycleText(text);
  if (parsed.valid && !parsed.lossy) return { state: parsed.state, locked: false };
  return { state: parsed.state, locked: !(await copyAside(storage, text)) };
}

export function createCycleStore(storage: KeyValueStorage): CycleStore {
  let current: CycleStoreState = { state: DEFAULT_CYCLE_STATE, ready: false, saveError: false, locked: false };
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const ready = createDeferred();
  const listeners = new Set<() => void>();

  function setState(patch: Partial<CycleStoreState>): void {
    const next = { ...current, ...patch };
    if (
      next.state === current.state && next.ready === current.ready &&
      next.saveError === current.saveError && next.locked === current.locked
    ) return;
    current = next;
    for (const listener of [...listeners]) listener();
  }

  function enqueue<T>(turn: () => Promise<T>): Promise<T> {
    const result = queue.then(turn);
    queue = result.then(settle, settle);
    return result;
  }

  async function load(): Promise<void> {
    const mine = ++token;
    const read = await readStored(storage);
    if (mine !== token) return;
    setState({ state: read.state, locked: read.locked, ready: true });
    ready.resolve();
  }

  /** The change is computed inside the serial queue from the last committed state; memory changes only after the write succeeded. */
  async function apply(change: (state: CycleState) => CycleResult): Promise<CycleActionResult> {
    await ready.promise;
    return enqueue(async (): Promise<CycleActionResult> => {
      if (current.locked) return { ok: false, reason: "locked" };
      const result = change(current.state);
      if (!result.ok) return result;
      if (result.state === current.state) return { ok: true };
      try {
        await storage.setItem(CYCLE_KEY, JSON.stringify(result.state));
      } catch {
        setState({ saveError: true });
        return { ok: false, reason: "write-failed" };
      }
      setState({ state: result.state, saveError: false });
      return { ok: true };
    });
  }

  return {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load,
    addPeriod: (period, today = dateKey(new Date())) => apply(state => addPeriod(state, period, today)),
    updatePeriod: (originalStart, next, today = dateKey(new Date())) =>
      apply(state => updatePeriod(state, originalStart, next, today)),
    removePeriod: start => apply(state => removePeriod(state, start)),
    setEnabled: enabled => apply(state => setEnabled(state, enabled)),
    acknowledge: () => apply(state => acknowledge(state)),
    setPaused: paused => apply(state => setPaused(state, paused)),
    updateDefaults: patch => apply(state => updateDefaults(state, patch)),
    updateReminders: patch => apply(state => updateReminders(state, patch)),
    updateLock: patch => apply(state => updateLock(state, patch)),
    setShowOnTimeline: show => apply(state => setShowOnTimeline(state, show)),
    importState: (incoming, mode) => apply(state => ({ ok: true, state: mergeCycleState(state, incoming, mode) })),
    reset: () => apply(() => ({ ok: true, state: DEFAULT_CYCLE_STATE })),
    dispose() { token += 1; },
  };
}
