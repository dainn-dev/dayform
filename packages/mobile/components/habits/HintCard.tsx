import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

const MIN_TOUCH_TARGET = 44;
const CLOSE_ICON_SIZE = 18;

export type HintAction = { key: string; label: string; onPress: () => void };

type Props = {
  headline: string;
  detail?: string;
  actions: readonly HintAction[];
  onDismiss: () => void;
};

/** A compact suggestion: a line of text, an optional detail line, action chips and a close button. */
export function HintCard({ headline, detail, actions, onDismiss }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.card}>
    <View style={s.body}>
      <Text style={s.headline}>{headline}</Text>
      {detail ? <Text style={s.detail}>{detail}</Text> : null}
      {actions.length > 0 && <View style={s.actions}>
        {actions.map(action => <Pressable key={action.key} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label} style={s.chip}>
          <Text style={s.chipText}>{action.label}</Text>
        </Pressable>)}
      </View>}
    </View>
    <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t("Dismiss suggestion")} style={s.close}>
      <Ionicons name="close" size={CLOSE_ICON_SIZE} color={colors.mutedForeground} />
    </Pressable>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start", gap: 4, marginTop: 12, paddingLeft: 14, paddingVertical: 6, backgroundColor: c.primaryTint, borderRadius: 15, borderWidth: 1, borderColor: c.primaryBorder },
  body: { flex: 1, paddingTop: 8, paddingBottom: 6 },
  headline: { color: c.foreground, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  detail: { color: c.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 15, justifyContent: "center", backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.primaryBorder },
  chipText: { color: c.primary, fontSize: 12, fontWeight: "700" },
  close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
});
