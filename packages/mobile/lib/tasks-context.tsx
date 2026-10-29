import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Task } from "./planner";
import { createTasksStore } from "./tasks-store";

type TasksContextValue = {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  lastRemoved: Task | null;
  clearError: () => void;
  upsert: (task: Task) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  mutate: (update: (tasks: Task[]) => Task[]) => Promise<boolean>;
  undoRemove: () => Promise<boolean>;
  clearUndo: () => void;
};
const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createTasksStore(AsyncStorage));

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const state = useSyncExternalStore(store.subscribe, store.getState);
  const value = useMemo<TasksContextValue>(
    () => ({
      ...state,
      clearError: store.clearError,
      upsert: store.upsert,
      remove: store.remove,
      mutate: store.mutate,
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
