import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import type { CycleState } from "../../lib/cycle-model";
import { cycleStats } from "../../lib/cycle-stats";
import { chartSummary, cycleBars } from "../../lib/cycle-ui-chart";
import { fromKey } from "../../lib/planner";
import { useLanguage } from "../../lib/language";
import { CycleCard } from "./CycleCard";
import { useCycleFormat } from "./use-cycle-format";

const CHART_HEIGHT = 110;

/** Cycle lengths as plain View bars, newest on the right, with the average, shortest and longest. */
export function CycleChart({ state }: { state: CycleState }) {
  const { t, locale } = useLanguage();
  const colors = useColors();
  const format = useCycleFormat();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const stats = useMemo(() => cycleStats(state), [state]);
  const bars = useMemo(() => cycleBars(stats, CHART_HEIGHT), [stats]);
  const summary = format.say(chartSummary(stats));

  return <CycleCard title={t("Cycle length")}>
    {bars.length === 0
      ? <Text style={s.text}>{summary}</Text>
      : <View>
          <View accessible accessibilityRole="image" accessibilityLabel={summary}>
            <View style={s.chart} importantForAccessibility="no-hide-descendants">
              {bars.map(bar => <View key={bar.start} style={s.column}>
                <Text style={s.value}>{bar.length}</Text>
                <View style={[s.bar, { height: bar.heightPx }]} />
                <Text style={s.tick} numberOfLines={1}>{fromKey(bar.start).toLocaleDateString(locale, { month: "numeric", day: "numeric" })}</Text>
              </View>)}
            </View>
          </View>
          <View style={s.tiles}>
            <Tile label={t("Average")} value={format.sayText("{count} days", { count: String(stats.average) })} styles={s} />
            <Tile label={t("Shortest")} value={format.sayText("{count} days", { count: String(stats.shortest) })} styles={s} />
            <Tile label={t("Longest")} value={format.sayText("{count} days", { count: String(stats.longest) })} styles={s} />
          </View>
        </View>}
  </CycleCard>;
}

function Tile({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.tile} accessible>
    <Text style={styles.tileLabel}>{label}</Text>
    <Text style={styles.tileValue}>{value}</Text>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  text: { color: c.foreground, fontSize: 13, lineHeight: 19 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: CHART_HEIGHT + 40 },
  column: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "70%", maxWidth: 22, borderRadius: 6, backgroundColor: c.primary },
  value: { color: c.foreground, fontSize: 10, fontWeight: "800", marginBottom: 3 },
  tick: { color: c.foreground, fontSize: 8, marginTop: 4 },
  tiles: { flexDirection: "row", gap: 8, marginTop: 14 },
  tile: { flex: 1, backgroundColor: c.primarySoft, borderRadius: 12, padding: 10 },
  tileLabel: { color: c.foreground, fontSize: 10, fontWeight: "700" },
  tileValue: { color: c.foreground, fontSize: 13, fontWeight: "800", marginTop: 2 },
});
