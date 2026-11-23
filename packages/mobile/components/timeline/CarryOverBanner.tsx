import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { IconButton } from "../ui/IconButton";
import { useLanguage } from "../../lib/language";

type Props = { count: number; onMove: () => void };

/** Offered on a past day that still has unfinished tasks: one tap moves them to today. */
export function CarryOverBanner({ count, onMove }: Props) {
  const { t } = useLanguage();
  const s = useThemedStyles(makeStyles);
  const summary = `${count} ${t(count === 1 ? "unfinished task" : "unfinished tasks")}`;
  return <View style={s.banner}>
    <Text style={s.summary}>{summary}</Text>
    <IconButton icon="arrow-forward" tone="primary" label={`${summary}. ${t("Move to today")}`} onPress={onMove} style={s.button} />
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.sm, marginTop: t.space.lg, marginHorizontal: t.space.xs, paddingLeft: 14, paddingRight: 6, backgroundColor: t.colors.primaryTint, borderRadius: t.radius.md },
  summary: { ...t.type.label, ...t.font.bold, flexShrink: 1, color: t.colors.foreground },
  button: { marginVertical: t.space.xs },
});
