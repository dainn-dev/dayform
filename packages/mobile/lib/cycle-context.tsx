import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_CYCLE_STATE,
  type CycleDefaults,
  type CycleLock,
  type CycleReminders,
  type CycleState,
  type Period,
} from "./cycle";
import { createCycleStore, type CycleActionResult } from "./cycle-store";

export type CycleContextValue = {
  state: CycleState;
  /** True once the stored data was read (or the read failed and defaults apply). */
  ready: boolean;
  /** True while the latest attempt to save failed; the previous value still applies. */
  saveError: boolean;
  /** True when the stored value could not be read safely, so changes are refused this session. */
  locked: boolean;
  /** `today` is a local `YYYY-MM-DD`; it defaults to the device's date. */
  addPeriod: (period: Period, today?: string) => Promise<CycleActionResult>;
  /** Replaces the period that starts on `originalStart`. */
  updatePeriod: (originalStart: string, next: Period, today?: string) => Promise<CycleActionResult>;
  removePeriod: (start: string) => Promise<CycleActionResult>;
  setEnabled: (enabled: boolean) => Promise<CycleActionResult>;
  acknowledge: () => Promise<CycleActionResult>;
  setPaused: (paused: boolean) => Promise<CycleActionResult>;
  updateDefaults: (patch: Partial<CycleDefaults>) => Promise<CycleActionResult>;
  updateReminders: (patch: Partial<CycleReminders>) => Promise<CycleActionResult>;
  updateLock: (patch: Partial<CycleLock>) => Promise<CycleActionResult>;
  setShowOnTimeline: (show: boolean) => Promise<CycleActionResult>;
  importState: (incoming: CycleState, mode: "merge" | "replace") => Promise<CycleActionResult>;
  /** Deletes all tracker data and puts every setting back to its default. */
  reset: () => Promise<CycleActionResult>;
};

const noChange = async (): Promise<CycleActionResult> => ({ ok: true });

/** Used outside a provider (error fallback, tests): the tracker is off and every action does nothing. */
const FALLBACK: CycleContextValue = {
  state: DEFAULT_CYCLE_STATE,
  ready: true,
  saveError: false,
  locked: false,
  addPeriod: noChange, updatePeriod: noChange, removePeriod: noChange, setEnabled: noChange, acknowledge: noChange,
  setPaused: noChange, updateDefaults: noChange, updateReminders: noChange, updateLock: noChange,
  setShowOnTimeline: noChange, importState: noChange, reset: noChange,
};

const CycleContext = createContext<CycleContextValue>(FALLBACK);

/** The data stays on the device: AsyncStorage only, no network. */
export function CycleProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createCycleStore(AsyncStorage));

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const value = useMemo<CycleContextValue>(() => ({
    state: snapshot.state,
    ready: snapshot.ready,
    saveError: snapshot.saveError,
    locked: snapshot.locked,
    addPeriod: store.addPeriod,
    updatePeriod: store.updatePeriod,
    removePeriod: store.removePeriod,
    setEnabled: store.setEnabled,
    acknowledge: store.acknowledge,
    setPaused: store.setPaused,
    updateDefaults: store.updateDefaults,
    updateReminders: store.updateReminders,
    updateLock: store.updateLock,
    setShowOnTimeline: store.setShowOnTimeline,
    importState: store.importState,
    reset: store.reset,
  }), [snapshot, store]);
  return <CycleContext.Provider value={value}>{children}</CycleContext.Provider>;
}

/** Never throws: without a provider it returns the defaults and no-op actions. */
export function useCycle(): CycleContextValue {
  return useContext(CycleContext);
}
