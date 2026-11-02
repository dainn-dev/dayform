import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_FOCUS_STATE, type FocusLogEntry, type FocusPrefs, type FocusSession } from "./focus";
import { createFocusStore, type FocusActionResult } from "./focus-store";

/** Which task the sheet was opened for (null = a free round); only meaningful while `open`. */
export type FocusSheetState = { open: boolean; taskId: string | null };

export type FocusContextValue = {
  /** True once the stored state was read (or the read failed and the state is empty). */
  ready: boolean;
  session: FocusSession | null;
  log: readonly FocusLogEntry[];
  prefs: FocusPrefs;
  saveError: boolean;
  start: (taskId: string | null, minutes?: number) => Promise<FocusActionResult>;
  pause: () => Promise<FocusActionResult>;
  resume: () => Promise<FocusActionResult>;
  stop: () => Promise<FocusActionResult>;
  skipBreak: () => Promise<FocusActionResult>;
  nextRound: () => Promise<FocusActionResult>;
  setPrefs: (prefs: Partial<FocusPrefs>) => Promise<FocusActionResult>;
  settle: () => Promise<FocusActionResult>;
  sheet: FocusSheetState;
  openSheet: (taskId?: string | null) => void;
  closeSheet: () => void;
};

const refused = async (): Promise<FocusActionResult> => ({ ok: false, reason: "locked" });

/** Used outside a provider (error fallback, tests): no session and actions that refuse. */
const FALLBACK: FocusContextValue = {
  ready: true, session: null, log: DEFAULT_FOCUS_STATE.log, prefs: DEFAULT_FOCUS_STATE.prefs, saveError: false,
  start: refused, pause: refused, resume: refused, stop: refused, skipBreak: refused, nextRound: refused, setPrefs: refused, settle: refused,
  sheet: { open: false, taskId: null }, openSheet: () => {}, closeSheet: () => {},
};

const FocusContext = createContext<FocusContextValue>(FALLBACK);

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createFocusStore(AsyncStorage));
  const [sheet, setSheet] = useState<FocusSheetState>({ open: false, taskId: null });

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const openSheet = useCallback((taskId: string | null = null) => setSheet({ open: true, taskId }), []);
  const closeSheet = useCallback(() => setSheet(current => ({ ...current, open: false })), []);
  const value = useMemo<FocusContextValue>(() => ({
    ready: snapshot.ready,
    session: snapshot.state.session,
    log: snapshot.state.log,
    prefs: snapshot.state.prefs,
    saveError: snapshot.saveError,
    start: store.start, pause: store.pause, resume: store.resume, stop: store.stop,
    skipBreak: store.skipBreak, nextRound: store.nextRound, setPrefs: store.setPrefs, settle: store.settle,
    sheet, openSheet, closeSheet,
  }), [snapshot, store, sheet, openSheet, closeSheet]);
  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

/** Never throws: without a provider it returns no session and actions that refuse. */
export function useFocus(): FocusContextValue {
  return useContext(FocusContext);
}
