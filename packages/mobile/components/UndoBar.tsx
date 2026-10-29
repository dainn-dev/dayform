import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useLanguage } from "@/lib/language";
import { useTasks } from "@/lib/tasks-context";

/** How long the snackbar stays before the undo opportunity expires. */
export const UNDO_TIMEOUT_MS = 6000;
const BAR_BOTTOM = 90;
const BAR_MARGIN = 16;
const MIN_TOUCH_TARGET = 44;

/** Snackbar offering to restore the last deleted task. Renders nothing otherwise. */
export function UndoBar() {
  const { lastRemoved, undoRemove, clearUndo } = useTasks();
  const { t } = useLanguage();
  const colors = useColors();

  useEffect(() => {
    if (lastRemoved === null) return undefined;
    const timer = setTimeout(clearUndo, UNDO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [lastRemoved, clearUndo]);

  if (lastRemoved === null) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadowSoft }]}
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
    bottom: BAR_BOTTOM,
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
