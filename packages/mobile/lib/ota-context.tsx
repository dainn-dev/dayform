import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createOtaChecker, type OtaAutoResult, type OtaCurrent, type OtaState, type OtaStatus } from "./ota";
import { expoOtaAdapter } from "./ota-expo";

export type OtaValue = OtaState & {
  /** The content the app is running now (read when the provider mounts: it only changes at a launch). */
  current: OtaCurrent;
  checkNow: () => Promise<OtaStatus>;
  checkAuto: () => Promise<OtaAutoResult>;
};

const OtaContext = createContext<OtaValue | null>(null);

export function useOta(): OtaValue {
  const value = useContext(OtaContext);
  if (!value) throw new Error("useOta must be used inside OtaProvider");
  return value;
}

/**
 * Owns the over-the-air checker. It only provides state and actions: the automatic check is started by
 * `<OtaAutoCheck />`. Mount inside SettingsProvider and LanguageProvider (inside UpdateProvider is fine).
 */
export function OtaProvider({ children }: { children: React.ReactNode }) {
  const [checker] = useState(() => createOtaChecker({ adapter: expoOtaAdapter, storage: AsyncStorage, now: Date.now }));
  const [current] = useState(() => checker.current());

  useEffect(() => {
    void checker.load();
  }, [checker]);

  const state = useSyncExternalStore(checker.subscribe, checker.getState, checker.getState);
  const value = useMemo<OtaValue>(() => ({
    ...state,
    current,
    checkNow: checker.checkNow,
    checkAuto: checker.checkAuto,
  }), [state, current, checker]);

  return <OtaContext.Provider value={value}>{children}</OtaContext.Provider>;
}
