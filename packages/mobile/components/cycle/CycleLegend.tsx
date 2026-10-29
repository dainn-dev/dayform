import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import type { CalendarDay } from "../../lib/cycle-calendar";
import { KIND_META, legendKinds, legendNote } from "../../lib/cycle-ui-kinds";
import { useLanguage } from "../../lib/language";
import { KindSymbol } from "./KindSymbol";

const LEGEND_SYMBOL = 12;

/** What the colors and shapes of the shown month mean. Lists only the kinds that appear in it. */
export function CycleLegend({ grid }: { grid: readonly (readonly CalendarDay[])[] }) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 8, marginTop: 12 },
  item: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  swatch: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  todaySwatch: { borderWidth: 1.5, borderColor: c.primary },
  text: { flexShrink: 1, color: c.foreground, fontSize: 11, fontWeight: "700" },
  note: { width: "100%", color: c.foreground, fontSize: 12, lineHeight: 17, fontWeight: "700" },
});
