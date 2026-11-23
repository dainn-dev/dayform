import React, { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { LockScreen } from "./LockScreen";
import { useCycleLock } from "./use-cycle-lock";
import { useSecureScreen } from "./use-secure-screen";

/**
 * Wraps the private cycle screen. The children are rendered only while the gate is open: never while locked, never
 * while the settings are still loading, and never while the app is in the background (so the app switcher shows a
 * blank page where the platform allows it). The whole gate, lock screen included, is excluded from screenshots and the
 * recents thumbnail (`useSecureScreen`). Touches on the open screen keep the inactivity window alive.
 */
export function CycleLockGate({ children }: { children: ReactNode }) {
  const s = useThemedStyles(makeStyles);
  const lock = useCycleLock();
  useSecureScreen();

  if (lock.covered) return <View style={s.cover} />;
  if (lock.view !== "open") {
    return <LockScreen notice={lock.notice} busy={lock.busy} loading={lock.view === "loading"}
      onUnlock={() => { void lock.unlock(); }} onContinue={() => { void lock.continueAnyway(); }} />;
  }
  return <View style={s.open} onTouchStart={lock.noteActivity}>{children}</View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  cover: { flex: 1, backgroundColor: t.colors.background },
  open: { flex: 1 },
});
