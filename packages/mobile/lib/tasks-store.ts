import type { Task } from "./planner";
import { TASKS_STORAGE_KEY, loadTasks, type KeyValueStorage, type LoadResult } from "./task-storage";

// These strings are also translation keys in language.tsx; keep them in sync.
export const LOAD_ERROR = "Could not load your saved tasks. Try reopening the app.";
export const SAVE_ERROR = "Your change could not be saved. Please try again.";
export const QUARANTINED_NOTICE = "Some saved tasks were damaged and were set aside. The rest were loaded.";
export const RECOVERED_NOTICE = "Your saved tasks could not be read, so a backup copy was kept and you are starting fresh.";
export const READ_ONLY_NOTICE = "Some saved tasks could not be backed up, so editing is paused to protect your data. Try reopening the app.";

export type TasksState = { tasks: Task[]; loading: boolean; error: string | null; lastRemoved: Task | null };

export type TasksStore = {
  getState(): TasksState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  upsert(task: Task): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  /** Generic write: `update` gets the committed list and returns the new one (returning the same array is a no-op). */
  mutate(update: (tasks: Task[]) => Task[]): Promise<boolean>;
  /** Re-adds the most recently removed task; false if there is none or the write failed. */
  undoRemove(): Promise<boolean>;
  clearUndo(): void;
  clearError(): void;
  dispose(): void;
};

type Update = (tasks: Task[]) => Task[];
type OnCommit = (before: Task[]) => Partial<TasksState>;

type Deferred = { promise: Promise<void>; resolve: () => void };

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(res => { resolve = res; });
  return { promise, resolve };
}

/** What the UI should show after a load, and why (if at all) writes must be refused. */
type LoadOutcome = { tasks: Task[]; error: string | null; writeBlock: string | null };

function outcomeOf(result: LoadResult): LoadOutcome {
  switch (result.kind) {
    case "locked":
      return { tasks: [], error: LOAD_ERROR, writeBlock: LOAD_ERROR };
    case "read-only":
      return { tasks: result.tasks, error: READ_ONLY_NOTICE, writeBlock: READ_ONLY_NOTICE };
    case "recovered":
      return { tasks: [], error: RECOVERED_NOTICE, writeBlock: null };
    case "ok":
      return { tasks: result.tasks, error: result.quarantined > 0 ? QUARANTINED_NOTICE : null, writeBlock: null };
    case "seed":
      return { tasks: result.tasks, error: null, writeBlock: null };
  }
}

function upsertTask(tasks: Task[], task: Task): Task[] {
  return tasks.some(t => t.id === task.id)
    ? tasks.map(t => (t.id === task.id ? task : t))
    : [...tasks, task];
}

export function createTasksStore(storage: KeyValueStorage): TasksStore {
  let state: TasksState = { tasks: [], loading: true, error: null, lastRemoved: null };
  let writeBlock: string | null = LOAD_ERROR;
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let ready = createDeferred();
  let readySettled = false;
  const listeners = new Set<() => void>();

  function setState(patch: Partial<TasksState>): void {
    const next = { ...state, ...patch };
    if (
      next.tasks === state.tasks && next.loading === state.loading &&
      next.error === state.error && next.lastRemoved === state.lastRemoved
    ) return;
    state = next;
    for (const listener of [...listeners]) listener();
  }

  /** Runs one turn after all previously enqueued turns; turns handle their own failures. */
  function enqueue<T>(turn: () => Promise<T>): Promise<T> {
    const result = queue.then(turn);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function persist(tasks: Task[]): Promise<boolean> {
    try {
      await storage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Must run inside a queue turn. `onCommit` derives extra state from the list the write was
   * computed from; it is applied in the same setState as the new list, and only on success.
   */
  async function applyWrite(update: Update, onCommit?: OnCommit): Promise<boolean> {
    if (writeBlock !== null) {
      setState({ error: writeBlock });
      return false;
    }
    const before = state.tasks;
    const next = update(before);
    if (next === before) return true;
    if (!(await persist(next))) {
      setState({ error: SAVE_ERROR });
      return false;
    }
    setState({ ...onCommit?.(before), tasks: next, error: null });
    return true;
  }

  async function write(update: Update, onCommit?: OnCommit): Promise<boolean> {
    await ready.promise;
    return enqueue(() => applyWrite(update, onCommit));
  }

  async function undoRemove(): Promise<boolean> {
    await ready.promise;
    return enqueue(async () => {
      const restored = state.lastRemoved;
      if (restored === null) return false;
      return applyWrite(tasks => upsertTask(tasks, restored), () => ({ lastRemoved: null }));
    });
  }

  function remove(id: string): Promise<boolean> {
    return write(
      tasks => (tasks.some(t => t.id === id) ? tasks.filter(t => t.id !== id) : tasks),
      before => ({ lastRemoved: before.find(t => t.id === id) ?? null }),
    );
  }

  function persistSeed(tasks: Task[]): Promise<void> {
    return enqueue(async () => {
      if (!(await persist(tasks))) setState({ error: SAVE_ERROR });
    });
  }

  async function readStorage(): Promise<LoadResult> {
    try {
      return await loadTasks(storage);
    } catch {
      return { kind: "locked", reason: "read-failed" };
    }
  }

  async function load(): Promise<void> {
    const mine = ++token;
    writeBlock = LOAD_ERROR;
    if (readySettled) {
      ready = createDeferred();
      readySettled = false;
    }
    setState({ loading: true });

    const result = await readStorage();
    if (mine !== token) return;

    const outcome = outcomeOf(result);
    writeBlock = outcome.writeBlock;
    setState({ tasks: outcome.tasks, error: outcome.error, loading: false, lastRemoved: null });
    const seedWrite = result.kind === "seed" ? persistSeed(result.tasks) : Promise.resolve();
    readySettled = true;
    ready.resolve();
    await seedWrite;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load,
    upsert: task => write(tasks => upsertTask(tasks, task)),
    remove,
    mutate: update => write(update),
    undoRemove,
    clearUndo: () => setState({ lastRemoved: null }),
    clearError: () => setState({ error: null }),
    dispose() { token += 1; },
  };
}
