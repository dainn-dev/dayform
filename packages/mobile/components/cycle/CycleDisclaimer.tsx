import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { tx } from "../../lib/cycle-ui-text";
import { useLanguage } from "../../lib/language";
import { CycleButton } from "./CycleButton";

/** The points the user must accept before tracking turns on. Plain statements, no assumptions about the user. */
export const DISCLAIMER_POINTS: readonly string[] = [
  tx("Your cycle data stays on this device and is never sent anywhere."),
  tx("Predictions are estimates calculated from the dates you enter."),
  tx("The lower-risk days estimate uses a calendar method. It is not a contraceptive and it can be wrong."),
  tx("Do not rely on it to prevent pregnancy."),
  tx("It is shown only when there is enough regular data."),
];

type Props = {
  visible: boolean;
  busy: boolean;
  /** Already translated error shown above the buttons. */
  error: string | null;
  onAccept: () => void;
  onCancel: () => void;
};

/** Blocking notice shown before tracking is switched on. Accepting is the only way forward; "Not now" leaves it off. */
export function CycleDisclaimer({ visible, busy, error, onAccept, onCancel }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
    <View style={s.center}>
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onCancel} accessible={false} importantForAccessibility="no" />
      <View style={s.card} accessibilityViewIsModal>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text accessibilityRole="header" style={s.title}>{t("Before you start")}</Text>
          {DISCLAIMER_POINTS.map(point => <View key={point} style={s.point}>
            <View style={s.bullet} />
            <Text style={s.pointText}>{t(point)}</Text>
          </View>)}
          {error !== null && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          <View style={s.actions}>
            <CycleButton label={t("I understand, turn on")} busy={busy} onPress={onAccept} />
            <CycleButton variant="secondary" label={t("Not now")} disabled={busy} onPress={onCancel} />
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24 },
  scrim: { backgroundColor: c.scrim },
  card: { width: "100%", maxWidth: 420, maxHeight: "100%", alignSelf: "center", backgroundColor: c.card, borderRadius: 22, padding: 20 },
  title: { color: c.foreground, fontSize: 20, fontWeight: "800", marginBottom: 12 },
  point: { flexDirection: "row", gap: 10, marginBottom: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary, marginTop: 7 },
  pointText: { flex: 1, color: c.foreground, fontSize: 13, lineHeight: 20 },
  error: { color: c.errorMessage, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  actions: { gap: 8, marginTop: 10 },
});
