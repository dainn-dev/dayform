import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useLanguage } from "@/lib/language";
import { undoBarBottom, undoTimeout } from "@/lib/shell-layout";
import { useTasks } from "@/lib/tasks-context";
import { undoActionLabel, undoFailedMessage, undoMessage } from "@/lib/undo";

const BAR_MARGIN = 16;
const MIN_TOUCH_TARGET = 44;
const FAILURE_MS = 4000;

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

/**
 * Runs the undo and reports when it changed nothing because every task was edited since (the store then
 * drops the undo, so the bar would vanish silently). A write failure keeps the undo and is shown as an
 * error elsewhere, so it is not reported here. `failed` clears itself after a few seconds.
 */
function useUndoAttempt(undo: unknown, undoLast: () => Promise<boolean>): { failed: boolean; attempt: () => void } {
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!checking) return;
    setChecking(false);
    if (undo === null) setFailed(true);
  }, [checking, undo]);
  useEffect(() => {
    if (!failed) return undefined;
    const timer = setTimeout(() => setFailed(false), FAILURE_MS);
    return () => clearTimeout(timer);
  }, [failed]);
  useEffect(() => {
    if (undo !== null) setFailed(false);
  }, [undo]);
  const attempt = () => {
    void undoLast().then(ok => { if (!ok) setChecking(true); });
  };
  return { failed, attempt };
}

/** Snackbar offering to undo the last delete or bulk change. Renders nothing otherwise. */
export function UndoBar() {
  const { undo, undoLast, clearUndo } = useTasks();
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const screenReader = useScreenReaderEnabled();
  const { failed, attempt } = useUndoAttempt(undo, undoLast);
  const visible = undo !== null || failed;
  const message = undo !== null ? undoMessage(undo, t) : failed ? undoFailedMessage(t) : "";

  // Live regions on a freshly mounted node are unreliable on Android, so announce explicitly.
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(message);
  }, [visible, undo, message]);

  useEffect(() => {
    if (undo === null) return undefined;
    const timer = setTimeout(clearUndo, undoTimeout(screenReader));
    return () => clearTimeout(timer);
  }, [undo, clearUndo, screenReader]);

  if (!visible) return null;

  return (
    <View
      style={[
        styles.bar,
        { bottom: undoBarBottom(insets.bottom), backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadowSoft },
      ]}
    >
      <Text style={[styles.message, { color: colors.foreground }]} numberOfLines={2}>
        {message}
      </Text>
      {undo !== null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={undoActionLabel(undo.kind, t)}
          hitSlop={8}
          onPress={attempt}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: colors.accentForeground }]}>{t("Undo")}</Text>
        </Pressable>
      )}
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
