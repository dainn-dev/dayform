import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { Button } from "../ui/Button";

type Props = { question: string; yes: string; busy: boolean; onYes: () => void; onCancel: () => void };

/**
 * Explicit confirmation for destructive recovery actions (replace, delete). Both texts are translation keys.
 * The question is announced when it appears (a live region plus an explicit announcement), because it shows up
 * in place of the buttons the user just pressed and a screen reader would otherwise say nothing.
 */
export function RecoveryConfirm({ question, yes, busy, onYes, onCancel }: Props) {
  const { t } = useLanguage();
  const s = useThemedStyles(makeStyles);
  const spoken = t(question);
  useEffect(() => { AccessibilityInfo.announceForAccessibility(spoken); }, [spoken]);
  return <View>
    <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={s.question}>{spoken}</Text>
    <View style={s.actions}>
      <Button variant="danger" label={t(yes)} disabled={busy} onPress={onYes} />
      <Button variant="secondary" label={t("Cancel")} onPress={onCancel} />
    </View>
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  question: { ...t.type.label, color: t.colors.foreground, marginTop: t.space.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, marginTop: t.space.sm },
});
