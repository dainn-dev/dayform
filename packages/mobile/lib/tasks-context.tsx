import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Task } from "./planner";
import { createTasksStore, type MutateOptions } from "./tasks-store";
import type { UndoState } from "./undo";
import { useXp } from "./xp-context";
import { xpChange } from "./xp-sync";

type TasksContextValue = {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  /** True when writes are refused (locked or read-only); background jobs should then do nothing. */
  writesBlocked: boolean;
  /** What the last undoable write changed; null when there is nothing to undo. */
  undo: UndoState | null;
  /** Derived from `undo` (a one-task delete); kept for older callers. */
  lastRemoved: Task | null;
  clearError: () => void;
  upsert: (task: Task) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  mutate: (update: (tasks: Task[]) => Task[], options?: MutateOptions) => Promise<boolean>;
  undoLast: () => Promise<boolean>;
  /** Alias of `undoLast`. */
  undoRemove: () => Promise<boolean>;
  clearUndo: () => void;
};
const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  // A finished task earns experience and a reopened one gives it back; the store reports each committed write.
  const xp = useXp();
  const xpRef = useRef(xp);
  xpRef.current = xp;
  const [store] = useState(() => createTasksStore(AsyncStorage, {
    onCommitted: ({ before, next }) => {
      const { finished, reopened } = xpChange(before, next);
      if (finished.length > 0) void xpRef.current.claim(finished, new Date());
      if (reopened.length > 0) void xpRef.current.revoke(reopened);
    },
  }));

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const value = useMemo<TasksContextValue>(
    () => ({
      ...state,
      clearError: store.clearError,
      upsert: store.upsert,
      remove: store.remove,
      mutate: store.mutate,
      undoLast: store.undoLast,
      undoRemove: store.undoRemove,
      clearUndo: store.clearUndo,
    }),
    [state, store],
  );
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) throw new Error("useTasks must be used inside TasksProvider");
  return context;
}
