import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
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
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
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

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    card: { flexDirection: "row", alignItems: "flex-start", gap: t.space.xs, marginTop: t.space.md, paddingLeft: 14, paddingVertical: 6, backgroundColor: c.primaryTint, borderRadius: t.radius.lg, borderWidth: 1, borderColor: c.primaryBorder },
    body: { flex: 1, paddingTop: t.space.sm, paddingBottom: 6 },
    headline: { ...t.type.label, color: c.foreground },
    detail: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground, marginTop: t.space.xxs },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, marginTop: t.space.sm },
    chip: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 15, justifyContent: "center", backgroundColor: c.card, borderRadius: t.radius.md, borderWidth: 1, borderColor: c.primaryBorder },
    chipText: { ...t.type.meta, ...t.font.bold, color: c.primary },
    close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  });
};
