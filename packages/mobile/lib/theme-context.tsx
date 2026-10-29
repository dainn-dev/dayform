import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  /** True once the stored preference has been read (or failed to), so the first paint uses the right scheme. */
  ready: boolean;
  /** Set when the last attempt to persist the choice failed; the choice still applies this session. */
  saveError: string | null;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

/** RN's way to say "follow the device" is the literal 'unspecified'. */
function nativeSchemeFor(preference: ThemePreference): "light" | "dark" | "unspecified" {
  return preference === "system" ? "unspecified" : preference;
}

/** Forces (or releases) the native appearance so dialogs, pickers and the system UI follow the choice. No-op on web. */
function applyNativeScheme(preference: ThemePreference): void {
  if (Platform.OS === "web") return;
  Appearance.setColorScheme(nativeSchemeFor(preference));
}

/**
 * The device scheme. Right after `setColorScheme("unspecified")` the `useColorScheme` value can still be the
 * previously forced scheme for one render, whereas `Appearance.getColorScheme()` already reports the real one.
 */
function deviceScheme(hookValue: unknown): unknown {
  if (Platform.OS === "web") return hookValue;
  return Appearance.getColorScheme() ?? hookValue;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const touched = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const hookScheme = useColorScheme();
  const scheme = resolveScheme(preference, preference === "system" ? deviceScheme(hookScheme) : hookScheme);

  useEffect(() => {
    let active = true;
    void loadThemePreference(AsyncStorage).then(stored => {
      if (!active) return;
      if (!touched.current) {
        applyNativeScheme(stored);
        setPreferenceState(stored);
      }
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    SystemUI.setBackgroundColorAsync(Colors[scheme].background).catch(() => {
      // Cosmetic only (root view / system background); nothing the user could act on.
    });
  }, [scheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    touched.current = true;
    applyNativeScheme(next);
    setPreferenceState(next);
    queue.current = queue.current.then(async () => {
      const result = await saveThemePreference(AsyncStorage, next);
      setSaveError(result.ok ? null : THEME_SAVE_ERROR);
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, scheme, ready, saveError, setPreference }),
    [preference, scheme, ready, saveError, setPreference],
  );

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
