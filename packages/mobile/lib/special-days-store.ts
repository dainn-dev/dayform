import {
  DEFAULT_SPECIAL_DAYS_STATE,
  addSpecialDay,
  mergeSpecialDaysState,
  parseSpecialDaysText,
  removeSpecialDay,
  updateSpecialDay,
  type SpecialDayFailure,
  type SpecialDayInput,
  type SpecialDayResult,
  type SpecialDaysState,
} from "./special-days";
import { contentKey, type KeyValueStorage } from "./task-storage";

export const SPECIAL_DAYS_KEY = "dayform.special-days.v1";
export const SPECIAL_DAYS_CORRUPT_PREFIX = "dayform.special-days.corrupt.";

export type SpecialDaysStoreState = {
  state: SpecialDaysState;
  /** True once the stored value was read (or the read failed and the list is empty). */
  ready: boolean;
  /** True while the latest attempt to persist failed; memory still holds the last value that was saved. */
  saveError: boolean;
  /** True when the stored value could not be read or safely copied: nothing is written until the next launch. */
  locked: boolean;
};

export type SpecialDaysActionResult = { ok: true; id?: string } | { ok: false; reason: SpecialDayFailure | "write-failed" | "locked" };

export type SpecialDaysStore = {
  getState(): SpecialDaysStoreState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  add(input: SpecialDayInput): Promise<SpecialDaysActionResult>;
  update(id: string, patch: Partial<SpecialDayInput>): Promise<SpecialDaysActionResult>;
  remove(id: string): Promise<SpecialDaysActionResult>;
  /** Applies the special days of a backup (`merge` keeps the current ones, `replace` takes the file's). */
  importState(incoming: SpecialDaysState, mode: "merge" | "replace"): Promise<SpecialDaysActionResult>;
  dispose(): void;
};

type Deferred = { promise: Promise<void>; resolve: () => void };

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(res => { resolve = res; });
  return { promise, resolve };
}

type Read = { state: SpecialDaysState; locked: boolean };

async function copyAside(storage: KeyValueStorage, text: string): Promise<boolean> {
  try {
    await storage.setItem(contentKey(SPECIAL_DAYS_CORRUPT_PREFIX, text), text);
    return true;
  } catch {
    return false;
  }
}

/** Never writes the main key. Bad data is copied to a content-addressed corrupt key first; no copy means locked. */
async function readStored(storage: KeyValueStorage): Promise<Read> {
  let text: string | null;
  try {
    text = await storage.getItem(SPECIAL_DAYS_KEY);
  } catch {
    return { state: DEFAULT_SPECIAL_DAYS_STATE, locked: true };
  }
  if (text === null) return { state: DEFAULT_SPECIAL_DAYS_STATE, locked: false };
  const parsed = parseSpecialDaysText(text);
  if (parsed.valid && !parsed.lossy) return { state: parsed.state, locked: false };
  return { state: parsed.state, locked: !(await copyAside(storage, text)) };
}

export function createSpecialDaysStore(storage: KeyValueStorage): SpecialDaysStore {
  let current: SpecialDaysStoreState = { state: DEFAULT_SPECIAL_DAYS_STATE, ready: false, saveError: false, locked: false };
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const ready = createDeferred();
  const listeners = new Set<() => void>();

  function setState(patch: Partial<SpecialDaysStoreState>): void {
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
    queue = result.then(() => undefined, () => undefined);
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
  async function apply(change: (state: SpecialDaysState) => SpecialDayResult): Promise<SpecialDaysActionResult> {
    await ready.promise;
    return enqueue(async () => {
      if (current.locked) return { ok: false, reason: "locked" };
      const result = change(current.state);
      if (!result.ok) return result;
      const outcome = result.id === undefined ? { ok: true as const } : { ok: true as const, id: result.id };
      if (result.state === current.state) return outcome;
      try {
        await storage.setItem(SPECIAL_DAYS_KEY, JSON.stringify(result.state));
      } catch {
        setState({ saveError: true });
        return { ok: false, reason: "write-failed" };
      }
      setState({ state: result.state, saveError: false });
      return outcome;
    });
  }

  return {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load,
    add: input => apply(state => addSpecialDay(state, input)),
    update: (id, patch) => apply(state => updateSpecialDay(state, id, patch)),
    remove: id => apply(state => removeSpecialDay(state, id)),
    importState: (incoming, mode) => apply(state => ({ ok: true, state: mergeSpecialDaysState(state, incoming, mode) })),
    dispose() { token += 1; },
  };
}
