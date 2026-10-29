import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useTasks } from "./tasks-context";
import { createUpdateStore, type CheckAutoResult, type UpdateStatus, type UpdateStoreState } from "./update-store";
import type { SaveUpdateStateResult } from "./update-state";
import type { FetchLike } from "./update-check";

export type UpdatesValue = UpdateStoreState & {
  /** Installed app version (`expo.version`). */
  currentVersion: string;
  checkNow: () => Promise<UpdateStatus>;
  checkAuto: () => Promise<CheckAutoResult>;
  setAuto: (auto: boolean) => Promise<SaveUpdateStateResult>;
  /** "Later". */
  dismiss: () => void;
  /** "Skip this version"; resolves to a failure (and leaves the prompt open) when the choice could not be saved. */
  skip: () => Promise<SaveUpdateStateResult>;
  openPrompt: () => void;
};

const UpdatesContext = createContext<UpdatesValue | null>(null);

// An over-the-air update that carries no app config leaves `expoConfig` empty; the runtime version equals expo.version.
const currentVersion = Constants.expoConfig?.version ?? Updates.runtimeVersion ?? "0.0.0";
const fetchFn: FetchLike = (url, init) => fetch(url, init);

export function useUpdates(): UpdatesValue {
  const value = useContext(UpdatesContext);
  if (!value) throw new Error("useUpdates must be used inside UpdateProvider");
  return value;
}

/**
 * Owns the update store, runs the automatic check once the tasks have loaded (so the prompt never competes with
 * the splash) and again whenever the app returns to the foreground (the 12 h throttle and the 15 min retry delay make
 * that cheap). Renders only its children: mount `<UpdatePrompt />` inside it.
 * Mount inside ThemeProvider, LanguageProvider and TasksProvider.
 */
export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createUpdateStore({ storage: AsyncStorage, fetchFn, currentVersion, now: Date.now }));
  const { loading } = useTasks();

  useEffect(() => {
    void store.load();
  }, [store]);

  useEffect(() => {
    if (loading) return undefined;
    void store.checkAuto();
    const subscription = AppState.addEventListener("change", next => {
      if (next === "active") void store.checkAuto();
    });
    return () => subscription.remove();
  }, [store, loading]);

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const value = useMemo<UpdatesValue>(() => ({
    ...state,
    currentVersion,
    checkNow: store.checkNow,
    checkAuto: store.checkAuto,
    setAuto: store.setAuto,
    dismiss: store.dismiss,
    skip: store.skip,
    openPrompt: store.openPrompt,
  }), [state, store]);

  return <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>;
}
