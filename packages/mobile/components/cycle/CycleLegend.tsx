import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import type { CalendarDay } from "../../lib/cycle-calendar";
import { KIND_META, legendKinds, legendNote } from "../../lib/cycle-ui-kinds";
import { useLanguage } from "../../lib/language";
import { KindSymbol } from "./KindSymbol";

const LEGEND_SYMBOL = 12;
const SWATCH = 24;

/** What the colors and shapes of the shown month mean. Lists only the kinds that appear in it. */
export function CycleLegend({ grid }: { grid: readonly (readonly CalendarDay[])[] }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const kinds = legendKinds(grid);
  const note = legendNote(kinds);
  return <View style={s.legend} accessibilityLabel={t("Legend")}>
    {kinds.map(kind => <View key={kind} style={s.item}>
      <View style={[s.swatch, { backgroundColor: colors.cycle[KIND_META[kind].group].bg }]}>
        <KindSymbol kind={kind} size={LEGEND_SYMBOL} />
      </View>
      <Text style={s.text}>{t(KIND_META[kind].label)}</Text>
    </View>)}
    <View style={s.item}>
      <View style={[s.swatch, s.todaySwatch]} />
      <Text style={s.text}>{t("Today")}</Text>
    </View>
    {note === null ? null : <Text style={s.note}>{t(note)}</Text>}
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: t.space.sm, marginTop: t.space.md },
  item: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: t.radius.sm, alignItems: "center", justifyContent: "center" },
  todaySwatch: { borderWidth: 1.5, borderColor: t.colors.primary },
  text: { ...t.type.caption, flexShrink: 1, color: t.colors.foreground },
  // The safety note of the lower-risk estimate: kept bold in every style.
  note: { ...t.type.meta, ...t.font.bold, width: "100%", color: t.colors.foreground },
});
