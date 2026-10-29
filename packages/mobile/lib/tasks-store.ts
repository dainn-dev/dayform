import type { Task } from "./planner";
import { MAX_RECORDS, TASKS_STORAGE_KEY, loadTasks, type KeyValueStorage, type LoadResult } from "./task-storage";
import { MAX_STORED_BYTES } from "./backup-flow";
import { utf8Length } from "./text-size";
import { applyUndo, diffTasks, type UndoKind, type UndoState } from "./undo";

// These strings are also translation keys in language.tsx; keep them in sync.
export const LOAD_ERROR = "Could not load your saved tasks. Try reopening the app.";
export const SAVE_ERROR = "Your change could not be saved. Please try again.";
export const QUARANTINED_NOTICE = "Some saved tasks were damaged and were set aside. The rest were loaded.";
export const RECOVERED_NOTICE = "Your saved tasks could not be read, so a backup copy was kept and you are starting fresh.";
export const READ_ONLY_NOTICE = "Some saved tasks could not be backed up, so editing is paused to protect your data. Try reopening the app.";

export const TOO_MANY_TASKS_ERROR = "You have reached the maximum number of tasks.";
export const TOO_LARGE_ERROR = "Your task list is too big to store. Archive old tasks in Settings to free space.";

export type TasksState = {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  /** What the last undoable write changed; null once undone, dismissed or replaced by a reload. */
  undo: UndoState | null;
  /** Derived from `undo`: the single task removed by the last delete, else null. Kept for older callers. */
  lastRemoved: Task | null;
  /** True once a load left writes refused (read failed, or some records could not be set aside). */
  writesBlocked: boolean;
};

export type MutateOptions = {
  /** Background write: refusals and failures return false without setting `error`, and a success keeps the current `error`. */
  silent?: boolean;
  /** Makes a successful write undoable via `undoLast`; the kind picks the UndoBar message. Ignored when nothing changed. */
  undo?: UndoKind;
};

export type TasksStore = {
  getState(): TasksState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  upsert(task: Task): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  /** Generic write: `update` gets the committed list and returns the new one (returning the same array is a no-op). */
  mutate(update: (tasks: Task[]) => Task[], options?: MutateOptions): Promise<boolean>;
  /**
   * Reverts the last undoable write on the committed list, skipping tasks edited since. False when there is
   * nothing to undo, every change was skipped (undo is then cleared) or the write failed (undo is kept).
   */
  undoLast(): Promise<boolean>;
  /** Alias of `undoLast`. */
  undoRemove(): Promise<boolean>;
  clearUndo(): void;
  clearError(): void;
  dispose(): void;
};

type Update = (tasks: Task[]) => Task[];
type OnCommit = (before: Task[], next: Task[]) => Partial<TasksState>;

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

/** The single removed task of a one-task delete, for callers that predate `undo`. */
function removedTaskOf(undo: UndoState | null): Task | null {
  if (undo === null || undo.kind !== "delete" || undo.changes.length !== 1) return null;
  const [change] = undo.changes;
  return change.after === null ? change.before : null;
}

/** Records what a write changed, unless it changed nothing (e.g. only the order). */
function undoCommit(kind: UndoKind): OnCommit {
  return (before, next) => {
    const changes = diffTasks(before, next);
    if (changes.length === 0) return {};
    // A "following" delete also detaches earlier rows (an edit): only the removed ones count as deleted.
    const removed = changes.filter(change => change.after === null).length;
    return { undo: { kind, changes, count: kind === "delete" && removed > 0 ? removed : changes.length } };
  };
}

/** `update` may throw (recurrence helpers do); null means it did. */
function computeNext(update: Update, before: Task[]): Task[] | null {
  try {
    return update(before);
  } catch {
    return null;
  }
}

/** UTF-8 never needs more than 3 bytes per UTF-16 unit, so a short enough string cannot exceed the cap. */
const MAX_BYTES_PER_UNIT = 3;

/** Both storage limits: MAX_RECORDS tasks and a serialized list of at most MAX_STORED_BYTES. */
export function fitsStoredLimits(tasks: readonly Task[]): boolean {
  return tasks.length <= MAX_RECORDS && utf8Length(JSON.stringify(tasks)) <= MAX_STORED_BYTES;
}

/**
 * Android can write a value bigger than it can read back, which would lock the app at every launch, so a
 * list over MAX_STORED_BYTES is refused. A write that does not grow the stored size stays allowed, so the
 * user can always recover (delete, shrink, undo) near the cap.
 */
function fitsSize(serialized: string, before: Task[]): boolean {
  if (serialized.length * MAX_BYTES_PER_UNIT <= MAX_STORED_BYTES) return true;
  const bytes = utf8Length(serialized);
  return bytes <= MAX_STORED_BYTES || bytes <= utf8Length(JSON.stringify(before));
}

function upsertTask(tasks: Task[], task: Task): Task[] {
  return tasks.some(t => t.id === task.id)
    ? tasks.map(t => (t.id === task.id ? task : t))
    : [...tasks, task];
}

export function createTasksStore(storage: KeyValueStorage): TasksStore {
  let state: TasksState = { tasks: [], loading: true, error: null, undo: null, lastRemoved: null, writesBlocked: false };
  let writeBlock: string | null = LOAD_ERROR;
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let ready = createDeferred();
  let readySettled = false;
  const listeners = new Set<() => void>();

  function setState(patch: Partial<TasksState>): void {
    const next = { ...state, ...patch };
    if (patch.undo !== undefined) next.lastRemoved = removedTaskOf(patch.undo);
    if (
      next.tasks === state.tasks && next.loading === state.loading &&
      next.error === state.error && next.undo === state.undo &&
      next.writesBlocked === state.writesBlocked
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

  async function persist(serialized: string): Promise<boolean> {
    try {
      await storage.setItem(TASKS_STORAGE_KEY, serialized);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Must run inside a queue turn. `onCommit` derives extra state from the list the write was
   * computed from; it is applied in the same setState as the new list, and only on success.
   */
  async function applyWrite(update: Update, onCommit?: OnCommit, silent = false): Promise<boolean> {
    const fail = (message: string): false => {
      if (!silent) setState({ error: message });
      return false;
    };
    if (writeBlock !== null) return fail(writeBlock);
    const before = state.tasks;
    const next = computeNext(update, before);
    if (next === null) return fail(SAVE_ERROR);
    if (next === before) return true;
    if (next.length > MAX_RECORDS) return fail(TOO_MANY_TASKS_ERROR);
    const serialized = JSON.stringify(next);
    if (!fitsSize(serialized, before)) return fail(TOO_LARGE_ERROR);
    if (!(await persist(serialized))) return fail(SAVE_ERROR);
    setState({ ...onCommit?.(before, next), tasks: next, ...(silent ? {} : { error: null }) });
    return true;
  }

  async function write(update: Update, onCommit?: OnCommit, silent = false): Promise<boolean> {
    await ready.promise;
    return enqueue(() => applyWrite(update, onCommit, silent));
  }

  async function undoLast(): Promise<boolean> {
    await ready.promise;
    return enqueue(async () => {
      const pending = state.undo;
      if (pending === null) return false;
      const result = applyUndo(state.tasks, pending.changes);
      if (result.reverted === 0) {
        setState({ undo: null });
        return false;
      }
      return applyWrite(() => result.tasks, () => ({ undo: null }));
    });
  }

  function remove(id: string): Promise<boolean> {
    return write(
      tasks => (tasks.some(t => t.id === id) ? tasks.filter(t => t.id !== id) : tasks),
      undoCommit("delete"),
    );
  }

  function persistSeed(tasks: Task[]): Promise<void> {
    return enqueue(async () => {
      if (!(await persist(JSON.stringify(tasks)))) setState({ error: SAVE_ERROR });
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
    setState({
      tasks: outcome.tasks,
      error: outcome.error,
      loading: false,
      undo: null,
      writesBlocked: outcome.writeBlock !== null,
    });
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
    mutate: (update, options) => write(update, options?.undo ? undoCommit(options.undo) : undefined, options?.silent === true),
    undoLast,
    undoRemove: undoLast,
    clearUndo: () => setState({ undo: null }),
    clearError: () => setState({ error: null }),
    dispose() { token += 1; },
  };
}
