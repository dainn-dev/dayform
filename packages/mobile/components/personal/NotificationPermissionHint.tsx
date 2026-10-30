import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import {
  ensureReminderChannel,
  getReminderPermission,
  requestReminderPermission,
  type ReminderPermission,
} from "../../lib/reminders-expo";

const DENIED_HINT = "Notifications are turned off. Turn them on in system settings to get reminders.";
const UNDETERMINED_HINT = "Notifications are off, so these options have no effect yet.";

/**
 * Shown only while notifications are not allowed. It reads the permission on mount and when the app returns to the
 * foreground (the user may have changed it in system settings), but only asks when the button is pressed.
 */
export function NotificationPermissionHint() {
  const { t, language } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [permission, setPermission] = useState<ReminderPermission | null>(null);

  const refresh = useCallback(() => {
    getReminderPermission().then(setPermission, () => setPermission("denied"));
  }, []);
  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => subscription.remove();
  }, [refresh]);

  const request = async () => {
    try {
      await ensureReminderChannel(language);
      setPermission(await requestReminderPermission());
    } catch {
      setPermission("denied");
    }
  };
  if (permission === null || permission === "granted") return null;
  return <View accessibilityRole="alert" style={s.box}>
    <Text style={s.text}>{t(permission === "denied" ? DENIED_HINT : UNDETERMINED_HINT)}</Text>
    <Pressable onPress={() => { void request(); }} accessibilityRole="button" style={s.button}>
      <Text style={s.buttonText}>{t("Allow notifications")}</Text>
    </Pressable>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  box: { backgroundColor: c.warningBg, borderRadius: 12, padding: 10, gap: 8 },
  text: { color: c.warningText, fontSize: 12, lineHeight: 17 },
  button: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 14, backgroundColor: c.primary },
  buttonText: { color: c.onPrimary, fontSize: 12, fontWeight: "700" },
});
