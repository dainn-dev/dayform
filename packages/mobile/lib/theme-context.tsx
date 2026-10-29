import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Appearance, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "../constants/palettes";
import { useColorScheme } from "../hooks/use-color-scheme";
import {
  loadThemePreference,
  resolveScheme,
  saveThemePreference,
  type ResolvedScheme,
  type ThemePreference,
} from "./theme-preference";

// This string is also a translation key (lib/i18n/theme.ts); keep them in sync.
export const THEME_SAVE_ERROR = "Could not save your appearance choice. It will reset when you reopen the app.";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  scheme: ResolvedScheme;
  /** Set when the last attempt to persist the choice failed; the choice still applies this session. */
  saveError: string | null;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

/** RN's way to say "follow the device" is the literal 'unspecified'. */
function nativeSchemeFor(preference: ThemePreference): "light" | "dark" | "unspecified" {
  return preference === "system" ? "unspecified" : preference;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const touched = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const systemScheme = useColorScheme();
  const scheme = resolveScheme(preference, systemScheme);

  useEffect(() => {
    let active = true;
    void loadThemePreference(AsyncStorage).then(stored => {
      if (active && !touched.current) setPreferenceState(stored);
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // Web has no native override; there `scheme` above already honors the preference.
    if (!loaded || Platform.OS === "web") return;
    Appearance.setColorScheme(nativeSchemeFor(preference));
  }, [loaded, preference]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    SystemUI.setBackgroundColorAsync(Colors[scheme].background).catch(() => {
      // Cosmetic only (root view / system background); nothing the user could act on.
    });
  }, [scheme]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    scheme,
    saveError,
    setPreference: next => {
      touched.current = true;
      setPreferenceState(next);
      queue.current = queue.current.then(async () => {
        const result = await saveThemePreference(AsyncStorage, next);
        setSaveError(result.ok ? null : THEME_SAVE_ERROR);
      });
    },
  }), [preference, scheme, saveError]);

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemePreference(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useThemePreference must be used inside ThemeProvider");
  return context;
}

/** Resolved scheme, or the device scheme when rendered outside a ThemeProvider. */
export function useResolvedScheme(): ResolvedScheme {
  const context = useContext(ThemeContext);
  const system = useColorScheme();
  return context?.scheme ?? resolveScheme("system", system);
}
