import React, { useEffect, useMemo } from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { CycleButton } from "./CycleButton";

type Props = {
  visible: boolean;
  /** Already translated. */
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  /** Already translated error shown above the buttons. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A small centered confirmation for destructive actions. Android back and the backdrop cancel. */
export function ConfirmDialog({ visible, title, message, confirmLabel, busy = false, error = null, onConfirm, onCancel }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(`${title}. ${message}`);
  }, [visible, title, message]);
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
    <View style={s.center}>
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onCancel} accessible={false} importantForAccessibility="no" />
      <View style={s.card} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={s.title}>{title}</Text>
        <Text style={s.message}>{message}</Text>
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
        <CycleButton variant="danger" label={confirmLabel} onPress={onConfirm} busy={busy} />
        <CycleButton variant="secondary" label={t("Cancel")} onPress={onCancel} disabled={busy} />
      </View>
    </View>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  scrim: { backgroundColor: c.scrim },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", backgroundColor: c.card, borderRadius: 22, padding: 20, gap: 10 },
  title: { color: c.foreground, fontSize: 18, fontWeight: "800" },
  message: { color: c.foreground, fontSize: 13, lineHeight: 19 },
  error: { color: c.errorMessage, fontSize: 12, lineHeight: 17 },
});
