import React, { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { FAB_MARGIN, FAB_SIZE } from "../../lib/shell-layout";

/** The round "add" button a settings page floats over its content, like "new task" on the Timeline. */
export type FloatingAction = { label: string; disabled: boolean; onPress: () => void };

type Register = (action: FloatingAction | null) => void;

const RegisterContext = createContext<Register>(() => {});

/** Bottom room a scrolling page needs so the last row is not hidden under the button. */
export const FLOATING_ACTION_CLEARANCE = FAB_SIZE + FAB_MARGIN * 2;

export function FloatingActionProvider({ register, children }: { register: Register; children: ReactNode }) {
  return <RegisterContext.Provider value={register}>{children}</RegisterContext.Provider>;
}

/**
 * Asks the page to float a button while the calling section is mounted. `onPress` may change on every render; the
 * page only re-renders when the label or the disabled state change.
 */
export function useFloatingAction({ label, disabled, onPress }: FloatingAction): void {
  const register = useContext(RegisterContext);
  const latest = useRef(onPress);
  latest.current = onPress;
  useEffect(() => {
    register({ label, disabled, onPress: () => latest.current() });
    return () => register(null);
  }, [register, label, disabled]);
}

export function FloatingAddButton({ action }: { action: FloatingAction }) {
  const colors = useColors();
  const { bottom } = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);
  // An absolutely placed child ignores the SafeAreaView's padding, so the system bar inset is added by hand.
  return <Pressable onPress={action.onPress} disabled={action.disabled} accessibilityRole="button" accessibilityLabel={action.label}
    accessibilityState={{ disabled: action.disabled }} style={[s.fab, { bottom: FAB_MARGIN + bottom }, action.disabled && s.disabled]}>
    <Ionicons name="add" size={30} color={colors.onPrimary} />
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  fab: { position: "absolute", right: 22, width: FAB_SIZE, height: FAB_SIZE, backgroundColor: c.primary, borderRadius: 20, alignItems: "center", justifyContent: "center", elevation: 7, shadowColor: c.fabShadow, shadowOpacity: 0.3, shadowRadius: 14 },
  disabled: { opacity: 0.45 },
});
