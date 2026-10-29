import {
  DEFAULT_SETTINGS,
  isValidName,
  loadSettings,
  mergeSettings,
  normalizeName,
  saveSettings,
  type DeepPartial,
  type Settings,
} from "./settings";
import type { KeyValueStorage } from "./task-storage";

export type SettingsState = {
  settings: Settings;
  /** True once the stored settings were read (or the read failed and defaults apply). */
  ready: boolean;
  /** True while the latest attempt to persist failed; the value still applies in memory. */
  saveError: boolean;
  hasName: boolean;
};

export type UpdateResult = { ok: true } | { ok: false; reason: "write-failed" };
export type SetNameResult = { ok: true } | { ok: false; reason: "invalid-name" | "write-failed" };

export type SettingsStore = {
  getState(): SettingsState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  /** Optimistic: memory changes once the store is ready, then the change is saved through a serial queue. */
  update(patch: DeepPartial<Settings>): Promise<UpdateResult>;
  setName(name: string): Promise<SetNameResult>;
  dispose(): void;
};

type Deferred = { promise: Promise<void>; resolve: () => void };

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(res => { resolve = res; });
  return { promise, resolve };
}

function initialState(): SettingsState {
  return { settings: DEFAULT_SETTINGS, ready: false, saveError: false, hasName: false };
}

export function createSettingsStore(storage: KeyValueStorage): SettingsStore {
  let state = initialState();
  let token = 0;
  /** Bumped by every applied update, so a late (re)load can tell the in-memory value is newer than its read. */
  let revision = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const ready = createDeferred();
  const listeners = new Set<() => void>();

  function setState(patch: Partial<Omit<SettingsState, "hasName">>): void {
    const settings = patch.settings ?? state.settings;
    const next: SettingsState = { ...state, ...patch, settings, hasName: settings.profile.name !== "" };
    if (
      next.settings === state.settings && next.ready === state.ready &&
      next.saveError === state.saveError && next.hasName === state.hasName
    ) return;
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function enqueue<T>(turn: () => Promise<T>): Promise<T> {
    const result = queue.then(turn);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  /** Each turn saves the newest in-memory settings, so the last write on disk always equals the final state. */
  function persist(): Promise<UpdateResult> {
    return enqueue(async () => {
      const result = await saveSettings(storage, state.settings);
      setState({ saveError: !result.ok });
      return result;
    });
  }

  async function load(): Promise<void> {
    const mine = ++token;
    const startRevision = revision;
    const result = await loadSettings(storage);
    if (mine !== token) return;
    setState(startRevision === revision ? { settings: result.settings, ready: true } : { ready: true });
    ready.resolve();
  }

  async function update(patch: DeepPartial<Settings>): Promise<UpdateResult> {
    await ready.promise;
    const next = mergeSettings(state.settings, patch);
    if (next === state.settings) return { ok: true };
    revision += 1;
    setState({ settings: next });
    return persist();
  }

  async function setName(name: string): Promise<SetNameResult> {
    if (!isValidName(name)) return { ok: false, reason: "invalid-name" };
    return update({ profile: { name: normalizeName(name) } });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load,
    update,
    setName,
    dispose() { token += 1; },
  };
}
