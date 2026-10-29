import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SETTINGS, type DeepPartial, type Settings } from "./settings";
import { createSettingsStore, type SetNameResult, type UpdateResult } from "./settings-store";

type SettingsContextValue = {
  settings: Settings;
  /** True once the stored settings were read (or the read failed and defaults apply). */
  ready: boolean;
  /** True while the latest attempt to save failed; the change still applies this session. */
  saveError: boolean;
  hasName: boolean;
  update: (patch: DeepPartial<Settings>) => Promise<UpdateResult>;
  setName: (name: string) => Promise<SetNameResult>;
};

/** Used outside a provider (error fallback, tests): defaults and actions that do nothing. */
const FALLBACK: SettingsContextValue = {
  settings: DEFAULT_SETTINGS,
  ready: true,
  saveError: false,
  hasName: false,
  update: async () => ({ ok: true }),
  setName: async () => ({ ok: false, reason: "invalid-name" }),
};

const SettingsContext = createContext<SettingsContextValue>(FALLBACK);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createSettingsStore(AsyncStorage));

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const value = useMemo<SettingsContextValue>(
    () => ({ ...state, update: store.update, setName: store.setName }),
    [state, store],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** Never throws: without a provider it returns DEFAULT_SETTINGS and no-op actions. */
export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
