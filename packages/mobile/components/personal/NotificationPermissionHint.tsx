import React, { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import {
  ensureReminderChannel,
  getReminderPermission,
  requestReminderPermission,
  type ReminderPermission,
} from "../../lib/reminders-expo";
import { Button } from "../ui/Button";

const DENIED_HINT = "Notifications are turned off. Turn them on in system settings to get reminders.";
const UNDETERMINED_HINT = "Notifications are off, so these options have no effect yet.";

/**
 * Shown only while notifications are not allowed. It reads the permission on mount and when the app returns to the
 * foreground (the user may have changed it in system settings), but only asks when the button is pressed.
 */
export function NotificationPermissionHint() {
  const { t, language } = useLanguage();
  const s = useThemedStyles(makeStyles);
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
    <Button label={t("Allow notifications")} onPress={() => { void request(); }} />
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  box: { backgroundColor: t.colors.warningBg, borderRadius: t.radius.md, padding: 10, gap: t.space.sm },
  text: { ...t.type.meta, ...t.font.regular, color: t.colors.warningText },
});
