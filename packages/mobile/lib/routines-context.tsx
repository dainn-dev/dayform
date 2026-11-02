import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Task } from "./planner";
import { DEFAULT_ROUTINES_STATE, type Routine } from "./routines";
import { createRoutinesStore, type RoutinesActionResult } from "./routines-store";

export type RoutinesContextValue = {
  items: readonly Routine[];
  ready: boolean;
  saveError: boolean;
  locked: boolean;
  addFromDay: (name: string, tasks: readonly Task[], date: string) => Promise<RoutinesActionResult>;
  rename: (id: string, name: string) => Promise<RoutinesActionResult>;
  remove: (id: string) => Promise<RoutinesActionResult>;
};

const refused = async (): Promise<RoutinesActionResult> => ({ ok: false, reason: "locked" });

/** Used outside a provider (error fallback, tests): no routines and actions that refuse. */
const FALLBACK: RoutinesContextValue = {
  items: DEFAULT_ROUTINES_STATE.items, ready: true, saveError: false, locked: true,
  addFromDay: refused, rename: refused, remove: refused,
};

const RoutinesContext = createContext<RoutinesContextValue>(FALLBACK);

export function RoutinesProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createRoutinesStore(AsyncStorage));

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const value = useMemo<RoutinesContextValue>(() => ({
    items: snapshot.state.items, ready: snapshot.ready, saveError: snapshot.saveError, locked: snapshot.locked,
    addFromDay: store.addFromDay, rename: store.rename, remove: store.remove,
  }), [snapshot, store]);
  return <RoutinesContext.Provider value={value}>{children}</RoutinesContext.Provider>;
}

/** Never throws: without a provider it returns an empty list and actions that refuse. */
export function useRoutines(): RoutinesContextValue {
  return useContext(RoutinesContext);
}
