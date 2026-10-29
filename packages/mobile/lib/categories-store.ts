import {
  DEFAULT_CATEGORIES_STATE,
  addCategory,
  hideBuiltin,
  mergeCategoriesState,
  parseCategoriesText,
  removeCategory,
  renameBuiltin,
  showBuiltin,
  updateCategory,
  type CategoriesState,
  type CategoryFailure,
  type CategoryResult,
  type NewCategoryInput,
  type Translate,
} from "./categories";
import { contentKey, type KeyValueStorage } from "./task-storage";

export const CATEGORIES_KEY = "dayform.categories.v1";
export const CATEGORIES_CORRUPT_PREFIX = "dayform.categories.corrupt.";

export type CategoriesStoreState = {
  state: CategoriesState;
  /** True once the stored value was read (or the read failed and defaults apply). */
  ready: boolean;
  /** True while the latest attempt to persist failed; memory still holds the last value that was saved. */
  saveError: boolean;
  /** True when the stored value could not be read or safely copied: nothing is written until the next launch. */
  locked: boolean;
};

export type CategoriesActionResult =
  | { ok: true; id?: string }
  | { ok: false; reason: CategoryFailure | "write-failed" | "locked" };

export type ActionOptions = { translate?: Translate };

export type CategoriesStore = {
  getState(): CategoriesStoreState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  add(input: NewCategoryInput, options?: ActionOptions): Promise<CategoriesActionResult>;
  update(id: string, patch: Partial<NewCategoryInput>, options?: ActionOptions): Promise<CategoriesActionResult>;
  remove(id: string): Promise<CategoriesActionResult>;
  hide(id: string): Promise<CategoriesActionResult>;
  show(id: string): Promise<CategoriesActionResult>;
  rename(id: string, name: string, options?: ActionOptions): Promise<CategoriesActionResult>;
  /** Applies the categories of a backup (`merge` keeps current choices, `replace` takes the file's). */
  importState(incoming: CategoriesState, mode: "merge" | "replace"): Promise<CategoriesActionResult>;
  dispose(): void;
};

type Deferred = { promise: Promise<void>; resolve: () => void };

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(res => { resolve = res; });
  return { promise, resolve };
}

type Read = { state: CategoriesState; locked: boolean };

async function copyAside(storage: KeyValueStorage, text: string): Promise<boolean> {
  try {
    await storage.setItem(contentKey(CATEGORIES_CORRUPT_PREFIX, text), text);
    return true;
  } catch {
    return false;
  }
}

/** Never writes the main key. Bad data is copied to a content-addressed corrupt key first; no copy means locked. */
async function readStored(storage: KeyValueStorage): Promise<Read> {
  let text: string | null;
  try {
    text = await storage.getItem(CATEGORIES_KEY);
  } catch {
    return { state: DEFAULT_CATEGORIES_STATE, locked: true };
  }
  if (text === null) return { state: DEFAULT_CATEGORIES_STATE, locked: false };
  const parsed = parseCategoriesText(text);
  if (parsed.valid && !parsed.lossy) return { state: parsed.state, locked: false };
  return { state: parsed.state, locked: !(await copyAside(storage, text)) };
}

export function createCategoriesStore(storage: KeyValueStorage): CategoriesStore {
  let current: CategoriesStoreState = { state: DEFAULT_CATEGORIES_STATE, ready: false, saveError: false, locked: false };
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const ready = createDeferred();
  const listeners = new Set<() => void>();

  function setState(patch: Partial<CategoriesStoreState>): void {
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
  async function apply(change: (state: CategoriesState) => CategoryResult): Promise<CategoriesActionResult> {
    await ready.promise;
    return enqueue(async () => {
      if (current.locked) return { ok: false, reason: "locked" };
      const result = change(current.state);
      if (!result.ok) return result;
      const outcome = result.id === undefined ? { ok: true as const } : { ok: true as const, id: result.id };
      if (result.state === current.state) return outcome;
      try {
        await storage.setItem(CATEGORIES_KEY, JSON.stringify(result.state));
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
    add: (input, options = {}) => apply(state => addCategory(state, input, { translate: options.translate })),
    update: (id, patch, options = {}) => apply(state => updateCategory(state, id, patch, { translate: options.translate })),
    remove: id => apply(state => removeCategory(state, id)),
    hide: id => apply(state => hideBuiltin(state, id)),
    show: id => apply(state => showBuiltin(state, id)),
    rename: (id, name, options = {}) => apply(state => renameBuiltin(state, id, name, { translate: options.translate })),
    importState: (incoming, mode) => apply(state => ({ ok: true, state: mergeCategoriesState(state, incoming, mode) })),
    dispose() { token += 1; },
  };
}
