import { contentKey, type KeyValueStorage } from "./task-storage";

/**
 * A small persisted state with the same safety rules as the categories and routines stores: it never writes the main key
 * before the stored value was read, damaged data is copied aside first (no copy = locked), every change is computed inside
 * one serial queue from the last committed state, and memory changes only after the write succeeded.
 */
export type Parsed<S> = { state: S; valid: boolean; lossy: boolean };

export type JsonStoreConfig<S> = {
  key: string;
  corruptPrefix: string;
  empty: S;
  parse: (text: string) => Parsed<S>;
};

export type JsonStoreState<S> = {
  state: S;
  /** True once the stored value was read (or the read failed and the state is empty). */
  ready: boolean;
  /** True while the latest attempt to persist failed; memory still holds the last value that was saved. */
  saveError: boolean;
  /** True when the stored value could not be read or safely copied: nothing is written until the next launch. */
  locked: boolean;
};

export type Change<S, F extends string> = { ok: true; state: S; id?: string } | { ok: false; reason: F };
export type ActionResult<F extends string> = { ok: true; id?: string } | { ok: false; reason: F | "write-failed" | "locked" };

export type JsonStore<S> = {
  getState(): JsonStoreState<S>;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  apply<F extends string>(change: (state: S) => Change<S, F>): Promise<ActionResult<F>>;
  dispose(): void;
};

export function createJsonStore<S>(storage: KeyValueStorage, config: JsonStoreConfig<S>): JsonStore<S> {
  let current: JsonStoreState<S> = { state: config.empty, ready: false, saveError: false, locked: false };
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const listeners = new Set<() => void>();

  function setState(patch: Partial<JsonStoreState<S>>): void {
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

  async function copyAside(text: string): Promise<boolean> {
    try {
      await storage.setItem(contentKey(config.corruptPrefix, text), text);
      return true;
    } catch {
      return false;
    }
  }

  async function readStored(): Promise<{ state: S; locked: boolean }> {
    let text: string | null;
    try {
      text = await storage.getItem(config.key);
    } catch {
      return { state: config.empty, locked: true };
    }
    if (text === null) return { state: config.empty, locked: false };
    const parsed = config.parse(text);
    if (parsed.valid && !parsed.lossy) return { state: parsed.state, locked: false };
    return { state: parsed.state, locked: !(await copyAside(text)) };
  }

  return {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async load() {
      const mine = ++token;
      const read = await readStored();
      if (mine !== token) return;
      setState({ state: read.state, locked: read.locked, ready: true });
      release();
    },
    async apply<F extends string>(change: (state: S) => Change<S, F>): Promise<ActionResult<F>> {
      await ready;
      return enqueue(async (): Promise<ActionResult<F>> => {
        if (current.locked) return { ok: false, reason: "locked" };
        const result = change(current.state);
        if (!result.ok) return result;
        const outcome = result.id === undefined ? { ok: true as const } : { ok: true as const, id: result.id };
        if (result.state === current.state) return outcome;
        try {
          await storage.setItem(config.key, JSON.stringify(result.state));
        } catch {
          setState({ saveError: true });
          return { ok: false, reason: "write-failed" };
        }
        setState({ state: result.state, saveError: false });
        return outcome;
      });
    },
    dispose() { token += 1; },
  };
}
