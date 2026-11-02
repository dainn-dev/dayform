import {
  DEFAULT_ROUTINES_STATE,
  addRoutineFromDay,
  parseRoutinesText,
  removeRoutine,
  renameRoutine,
  type RoutineFailure,
  type RoutineResult,
  type RoutinesState,
} from "./routines";
import type { Task } from "./planner";
import { contentKey, type KeyValueStorage } from "./task-storage";

export const ROUTINES_KEY = "dayform.routines.v1";
export const ROUTINES_CORRUPT_PREFIX = "dayform.routines.corrupt.";

export type RoutinesStoreState = {
  state: RoutinesState;
  /** True once the stored value was read (or the read failed and the list is empty). */
  ready: boolean;
  /** True while the latest attempt to persist failed; memory still holds the last value that was saved. */
  saveError: boolean;
  /** True when the stored value could not be read or safely copied: nothing is written until the next launch. */
  locked: boolean;
};

export type RoutinesActionResult = { ok: true; id?: string } | { ok: false; reason: RoutineFailure | "write-failed" | "locked" };

export type RoutinesStore = {
  getState(): RoutinesStoreState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  /** Saves the scheduled tasks of `date` as a routine named `name`. */
  addFromDay(name: string, tasks: readonly Task[], date: string): Promise<RoutinesActionResult>;
  rename(id: string, name: string): Promise<RoutinesActionResult>;
  remove(id: string): Promise<RoutinesActionResult>;
  dispose(): void;
};

type Read = { state: RoutinesState; locked: boolean };

async function copyAside(storage: KeyValueStorage, text: string): Promise<boolean> {
  try {
    await storage.setItem(contentKey(ROUTINES_CORRUPT_PREFIX, text), text);
    return true;
  } catch {
    return false;
  }
}

/** Never writes the main key. Bad data is copied to a content-addressed corrupt key first; no copy means locked. */
async function readStored(storage: KeyValueStorage): Promise<Read> {
  let text: string | null;
  try {
    text = await storage.getItem(ROUTINES_KEY);
  } catch {
    return { state: DEFAULT_ROUTINES_STATE, locked: true };
  }
  if (text === null) return { state: DEFAULT_ROUTINES_STATE, locked: false };
  const parsed = parseRoutinesText(text);
  if (parsed.valid && !parsed.lossy) return { state: parsed.state, locked: false };
  return { state: parsed.state, locked: !(await copyAside(storage, text)) };
}

export function createRoutinesStore(storage: KeyValueStorage): RoutinesStore {
  let current: RoutinesStoreState = { state: DEFAULT_ROUTINES_STATE, ready: false, saveError: false, locked: false };
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const listeners = new Set<() => void>();

  function setState(patch: Partial<RoutinesStoreState>): void {
    const next = { ...current, ...patch };
    if (next.state === current.state && next.ready === current.ready && next.saveError === current.saveError && next.locked === current.locked) return;
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
    release();
  }

  /** The change is computed inside the serial queue from the last committed state; memory changes only after the write succeeded. */
  async function apply(change: (state: RoutinesState) => RoutineResult): Promise<RoutinesActionResult> {
    await ready;
    return enqueue(async () => {
      if (current.locked) return { ok: false, reason: "locked" };
      const result = change(current.state);
      if (!result.ok) return result;
      const outcome = result.id === undefined ? { ok: true as const } : { ok: true as const, id: result.id };
      if (result.state === current.state) return outcome;
      try {
        await storage.setItem(ROUTINES_KEY, JSON.stringify(result.state));
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
    addFromDay: (name, tasks, date) => apply(state => addRoutineFromDay(state, name, tasks, date)),
    rename: (id, name) => apply(state => renameRoutine(state, id, name)),
    remove: id => apply(state => removeRoutine(state, id)),
    dispose() { token += 1; },
  };
}
