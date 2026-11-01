import type { Task } from "./planner";
import type { Ladder } from "./realm";
import { contentKey, type KeyValueStorage } from "./task-storage";
import { claimTasks, EMPTY_XP, mergeXp, parseXpText, revokeTasks, settleDays, XP_KEY, type SettleEvent, type XpState } from "./xp";

export const XP_CORRUPT_PREFIX = "dayform.xp.corrupt.";

export type XpStoreState = {
  state: XpState;
  /** True once the stored value was read (or the read failed and the empty state applies). */
  ready: boolean;
  /** True while the latest attempt to persist failed; memory still holds the last value that was saved. */
  saveError: boolean;
  /** True when the stored value could not be read or safely copied: nothing is written until the next launch. */
  locked: boolean;
};

export type XpActionResult =
  | { ok: true; gained: number; rankUp: boolean; events: SettleEvent[] }
  | { ok: false; reason: "write-failed" | "locked" };

export type XpStore = {
  getState(): XpStoreState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  /** Gives the experience for tasks that were just finished (`now` is when they were finished). */
  claim(tasks: readonly Task[], now: Date, ladder?: Ladder): Promise<XpActionResult>;
  /** Takes back what the tasks gave (an undone completion, a deleted task). */
  revoke(ids: readonly string[]): Promise<XpActionResult>;
  /** Judges the days that are over: rest days, penalties, the streak. */
  settle(now: Date, ladder?: Ladder): Promise<XpActionResult>;
  importState(incoming: XpState, mode: "merge" | "replace"): Promise<XpActionResult>;
  /** Starts again from nothing. */
  reset(): Promise<XpActionResult>;
  dispose(): void;
};

type Deferred = { promise: Promise<void>; resolve: () => void };

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(res => { resolve = res; });
  return { promise, resolve };
}

type Read = { state: XpState; locked: boolean };

async function copyAside(storage: KeyValueStorage, text: string): Promise<boolean> {
  try {
    await storage.setItem(contentKey(XP_CORRUPT_PREFIX, text), text);
    return true;
  } catch {
    return false;
  }
}

/** Never writes the main key. A value that cannot be read is copied to a content-addressed corrupt key first; no copy means locked. */
async function readStored(storage: KeyValueStorage): Promise<Read> {
  let text: string | null;
  try {
    text = await storage.getItem(XP_KEY);
  } catch {
    return { state: EMPTY_XP, locked: true };
  }
  if (text === null) return { state: EMPTY_XP, locked: false };
  const parsed = parseXpText(text);
  if (parsed.valid) return { state: parsed.state, locked: false };
  return { state: EMPTY_XP, locked: !(await copyAside(storage, text)) };
}

export function createXpStore(storage: KeyValueStorage): XpStore {
  let current: XpStoreState = { state: EMPTY_XP, ready: false, saveError: false, locked: false };
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const ready = createDeferred();
  const listeners = new Set<() => void>();

  function setState(patch: Partial<XpStoreState>): void {
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
    ready.resolve();
  }

  /** The change is computed inside the serial queue from the last committed state; memory changes only after the write succeeded. */
  async function apply(change: (state: XpState) => { state: XpState; gained?: number; rankUp?: boolean; events?: SettleEvent[] }): Promise<XpActionResult> {
    await ready.promise;
    return enqueue(async (): Promise<XpActionResult> => {
      if (current.locked) return { ok: false, reason: "locked" };
      const result = change(current.state);
      const outcome = { ok: true as const, gained: result.gained ?? 0, rankUp: result.rankUp ?? false, events: result.events ?? [] };
      if (result.state === current.state) return outcome;
      try {
        await storage.setItem(XP_KEY, JSON.stringify(result.state));
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
    claim: (tasks, now, ladder) => apply(state => {
      const { state: next, gained, rankUp } = claimTasks(state, tasks, now, ladder);
      return { state: next, gained, rankUp };
    }),
    revoke: ids => apply(state => ({ state: revokeTasks(state, ids) })),
    settle: (now, ladder) => apply(state => settleDays(state, now, ladder)),
    importState: (incoming, mode) => apply(state => ({ state: mergeXp(state, incoming, mode) })),
    reset: () => apply(() => ({ state: EMPTY_XP })),
    dispose() { token += 1; },
  };
}
