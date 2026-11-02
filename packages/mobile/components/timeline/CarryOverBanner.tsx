import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { IconButton } from "../ui/IconButton";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

type Props = { count: number; onMove: () => void };

/** Offered on a past day that still has unfinished tasks: one tap moves them to today. */
export function CarryOverBanner({ count, onMove }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const summary = `${count} ${t(count === 1 ? "unfinished task" : "unfinished tasks")}`;
  return <View style={s.banner}>
    <Text style={s.summary}>{summary}</Text>
    <IconButton icon="arrow-forward" tone="primary" label={`${summary}. ${t("Move to today")}`} onPress={onMove} style={s.button} />
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 16, marginHorizontal: 4, paddingLeft: 14, paddingRight: 6, backgroundColor: c.primaryTint, borderRadius: 14 },
  summary: { flexShrink: 1, color: c.foreground, fontSize: 13, fontWeight: "700" },
  button: { marginVertical: 4 },
});
