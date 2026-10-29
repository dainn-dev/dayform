import { useEffect, useMemo } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import type { ThemeColors } from "../../constants/theme";

type Props = { question: string; yes: string; busy: boolean; onYes: () => void; onCancel: () => void };

/**
 * Explicit confirmation for destructive recovery actions (replace, delete). Both texts are translation keys.
 * The question is announced when it appears (a live region plus an explicit announcement), because it shows up
 * in place of the buttons the user just pressed and a screen reader would otherwise say nothing.
 */
export function RecoveryConfirm({ question, yes, busy, onYes, onCancel }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const spoken = t(question);
  useEffect(() => { AccessibilityInfo.announceForAccessibility(spoken); }, [spoken]);
  return <View>
    <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={s.question}>{spoken}</Text>
    <View style={s.actions}>
      <Pressable disabled={busy} onPress={onYes} accessibilityRole="button" accessibilityState={{ disabled: busy }}
        style={[s.button, s.danger, busy && s.disabled]}>
        <Text style={s.dangerText}>{t(yes)}</Text>
      </Pressable>
      <Pressable onPress={onCancel} accessibilityRole="button" style={[s.button, s.secondary]}>
        <Text style={s.secondaryText}>{t("Cancel")}</Text>
      </Pressable>
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  question: { color: c.foreground, fontSize: 13, fontWeight: "700", marginTop: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  button: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  danger: { backgroundColor: c.destructive }, dangerText: { color: c.onPrimary, fontSize: 12, fontWeight: "800" },
  secondary: { backgroundColor: c.card, borderWidth: 1, borderColor: c.primaryBorder }, secondaryText: { color: c.foreground, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
});
