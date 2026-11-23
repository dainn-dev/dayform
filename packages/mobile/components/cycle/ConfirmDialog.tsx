import React, { useEffect } from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { Surface } from "../ui/Surface";
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
  const s = useThemedStyles(makeStyles);
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(`${title}. ${message}`);
  }, [visible, title, message]);
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
    <View style={s.center}>
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onCancel} accessible={false} importantForAccessibility="no" />
      <Surface level="overlay" padding="xl" style={s.card} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={s.title}>{title}</Text>
        <Text style={s.message}>{message}</Text>
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
        <CycleButton variant="danger" label={confirmLabel} onPress={onConfirm} busy={busy} />
        <CycleButton variant="secondary" label={t("Cancel")} onPress={onCancel} disabled={busy} />
      </Surface>
    </View>
  </Modal>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: t.space.xxl },
  scrim: { backgroundColor: t.colors.scrim },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", gap: 10 },
  title: { ...t.type.title, color: t.colors.foreground },
  message: { ...t.type.body, color: t.colors.foreground },
  error: { ...t.type.meta, ...t.font.regular, color: t.colors.errorMessage },
});
