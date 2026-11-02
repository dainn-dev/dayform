import {
  DEFAULT_FOCUS_STATE,
  nextRound,
  parseFocusText,
  pauseFocus,
  resumeFocus,
  setFocusPrefs,
  settleFocus,
  skipBreak,
  startFocus,
  stopFocus,
  type FocusPrefs,
  type FocusState,
} from "./focus";
import { contentKey, type KeyValueStorage } from "./task-storage";

export const FOCUS_KEY = "dayform.focus.v1";
export const FOCUS_CORRUPT_PREFIX = "dayform.focus.corrupt.";

export type FocusStoreState = {
  state: FocusState;
  /** True once the stored value was read (or the read failed and the state is empty). */
  ready: boolean;
  /** True while the latest attempt to persist failed. */
  saveError: boolean;
  /** True when the stored value could not be read or safely copied: nothing is written until the next launch. */
  locked: boolean;
};

export type FocusActionResult = { ok: true } | { ok: false; reason: "write-failed" | "locked" };

export type FocusStore = {
  getState(): FocusStoreState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  start(taskId: string | null, minutes?: number): Promise<FocusActionResult>;
  pause(): Promise<FocusActionResult>;
  resume(): Promise<FocusActionResult>;
  /** Ends the session; a focus round stopped early is logged for the minutes spent. */
  stop(): Promise<FocusActionResult>;
  /** Ends a break early. */
  skipBreak(): Promise<FocusActionResult>;
  /** Starts another focus round on the same task after (or during) a break. */
  nextRound(): Promise<FocusActionResult>;
  setPrefs(prefs: Partial<FocusPrefs>): Promise<FocusActionResult>;
  /** Applies the phases that are over by now. Cheap when nothing is due, so a ticking screen may call it every second. */
  settle(): Promise<FocusActionResult>;
  dispose(): void;
};

type Read = { state: FocusState; locked: boolean };

async function copyAside(storage: KeyValueStorage, text: string): Promise<boolean> {
  try {
    await storage.setItem(contentKey(FOCUS_CORRUPT_PREFIX, text), text);
    return true;
  } catch {
    return false;
  }
}

/** Never writes the main key. Bad data is copied to a content-addressed corrupt key first; no copy means locked. */
async function readStored(storage: KeyValueStorage): Promise<Read> {
  let text: string | null;
  try {
    text = await storage.getItem(FOCUS_KEY);
  } catch {
    return { state: DEFAULT_FOCUS_STATE, locked: true };
  }
  if (text === null) return { state: DEFAULT_FOCUS_STATE, locked: false };
  const parsed = parseFocusText(text);
  if (parsed.valid && !parsed.lossy) return { state: parsed.state, locked: false };
  return { state: parsed.state, locked: !(await copyAside(storage, text)) };
}

/** `now` is a parameter so tests control the clock. */
export function createFocusStore(storage: KeyValueStorage, now: () => number = Date.now): FocusStore {
  let current: FocusStoreState = { state: DEFAULT_FOCUS_STATE, ready: false, saveError: false, locked: false };
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const listeners = new Set<() => void>();

  function setState(patch: Partial<FocusStoreState>): void {
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
    if (!read.locked) await apply(state => settleFocus(state, now()));
  }

  /** The change is computed inside the serial queue from the last committed state; memory changes only after the write succeeded. */
  async function apply(change: (state: FocusState) => FocusState): Promise<FocusActionResult> {
    await ready;
    return enqueue(async () => {
      if (current.locked) return { ok: false, reason: "locked" } as const;
      const next = change(current.state);
      if (next === current.state) return { ok: true } as const;
      try {
        await storage.setItem(FOCUS_KEY, JSON.stringify(next));
      } catch {
        setState({ saveError: true });
        return { ok: false, reason: "write-failed" } as const;
      }
      setState({ state: next, saveError: false });
      return { ok: true } as const;
    });
  }

  return {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load,
    start: (taskId, minutes) => apply(state => startFocus(state, now(), taskId, minutes)),
    pause: () => apply(state => pauseFocus(state, now())),
    resume: () => apply(state => resumeFocus(state, now())),
    stop: () => apply(state => stopFocus(state, now())),
    skipBreak: () => apply(skipBreak),
    nextRound: () => apply(state => nextRound(state, now())),
    setPrefs: prefs => apply(state => setFocusPrefs(state, prefs)),
    settle: () => apply(state => settleFocus(state, now())),
    dispose() { token += 1; },
  };
}
