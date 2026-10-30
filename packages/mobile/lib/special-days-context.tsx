import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSpecialDaysStore, type SpecialDaysActionResult } from "./special-days-store";
import { DEFAULT_SPECIAL_DAYS_STATE, type SpecialDay, type SpecialDayInput, type SpecialDaysState } from "./special-days";

export type SpecialDaysContextValue = {
  items: readonly SpecialDay[];
  /** True once the stored list was read (or the read failed and the list is empty). */
  ready: boolean;
  /** True while the latest attempt to save failed; the previous list still applies. */
  saveError: boolean;
  /** True when the stored list could not be read safely, so changes are refused this session. */
  locked: boolean;
  add: (input: SpecialDayInput) => Promise<SpecialDaysActionResult>;
  update: (id: string, patch: Partial<SpecialDayInput>) => Promise<SpecialDaysActionResult>;
  remove: (id: string) => Promise<SpecialDaysActionResult>;
  importState: (incoming: SpecialDaysState, mode: "merge" | "replace") => Promise<SpecialDaysActionResult>;
};

const noChange = async (): Promise<SpecialDaysActionResult> => ({ ok: true });

/** Used outside a provider (error fallback, tests): no special days and actions that do nothing. */
const FALLBACK: SpecialDaysContextValue = {
  items: DEFAULT_SPECIAL_DAYS_STATE.items,
  ready: true,
  saveError: false,
  locked: false,
  add: noChange, update: noChange, remove: noChange, importState: noChange,
};

const SpecialDaysContext = createContext<SpecialDaysContextValue>(FALLBACK);

export function SpecialDaysProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createSpecialDaysStore(AsyncStorage));

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const value = useMemo<SpecialDaysContextValue>(() => ({
    items: snapshot.state.items,
    ready: snapshot.ready,
    saveError: snapshot.saveError,
    locked: snapshot.locked,
    add: store.add, update: store.update, remove: store.remove, importState: store.importState,
  }), [snapshot, store]);
  return <SpecialDaysContext.Provider value={value}>{children}</SpecialDaysContext.Provider>;
}

/** Never throws: without a provider it returns an empty list and no-op actions. */
export function useSpecialDays(): SpecialDaysContextValue {
  return useContext(SpecialDaysContext);
}
