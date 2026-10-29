import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useLanguage } from "@/lib/language";
import { undoBarBottom, undoTimeout } from "@/lib/shell-layout";
import { useTasks } from "@/lib/tasks-context";

const BAR_MARGIN = 16;
const MIN_TOUCH_TARGET = 44;

/** Tracks whether TalkBack / VoiceOver is on; false until the first answer arrives. */
function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then(value => { if (active) setEnabled(value); })
      .catch(() => { /* Treat an unreadable setting as "off": the default window still applies. */ });
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setEnabled);
    return () => { active = false; subscription.remove(); };
  }, []);
  return enabled;
}

/** Snackbar offering to restore the last deleted task. Renders nothing otherwise. */
export function UndoBar() {
  const { lastRemoved, undoRemove, clearUndo } = useTasks();
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const screenReader = useScreenReaderEnabled();
  const visible = lastRemoved !== null;

  // Live regions on a freshly mounted node are unreliable on Android, so announce explicitly.
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(t("Task deleted"));
  }, [visible, lastRemoved, t]);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(clearUndo, undoTimeout(screenReader));
    return () => clearTimeout(timer);
  }, [visible, lastRemoved, clearUndo, screenReader]);

  if (!visible) return null;

  return (
    <View
      style={[
        styles.bar,
        { bottom: undoBarBottom(insets.bottom), backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadowSoft },
      ]}
    >
      <Text style={[styles.message, { color: colors.foreground }]} numberOfLines={1}>
        {t("Task deleted")}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Undo delete")}
        hitSlop={8}
        onPress={() => { void undoRemove(); }}
        style={styles.action}
      >
        <Text style={[styles.actionText, { color: colors.accentForeground }]}>{t("Undo")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: BAR_MARGIN,
    right: BAR_MARGIN,
    minHeight: MIN_TOUCH_TARGET + 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  message: { flex: 1, fontSize: 15, fontWeight: "500" },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { fontSize: 15, fontWeight: "700" },
});
