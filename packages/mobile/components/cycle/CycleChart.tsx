import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import type { CycleState } from "../../lib/cycle-model";
import { cycleStats } from "../../lib/cycle-stats";
import { chartSummary, cycleBars } from "../../lib/cycle-ui-chart";
import { fromKey } from "../../lib/planner";
import { useLanguage } from "../../lib/language";
import { CycleCard } from "./CycleCard";
import { useCycleFormat } from "./use-cycle-format";

const CHART_HEIGHT = 110;
/** The date under a bar sits in a column only a bar wide (up to a dozen share the card), so it keeps a tiny fixed size. */
const TICK_SIZE = 8;

/** Cycle lengths as plain View bars, newest on the right, with the average, shortest and longest. */
export function CycleChart({ state }: { state: CycleState }) {
  const { t, locale } = useLanguage();
  const format = useCycleFormat();
  const s = useThemedStyles(makeStyles);
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

const makeStyles = (t: Theme) => StyleSheet.create({
  text: { ...t.type.body, color: t.colors.foreground },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: t.space.xs, height: CHART_HEIGHT + 40 },
  column: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  // xs, not sm: the bar is at most 22px wide, and a bigger corner would round it into a pill.
  bar: { width: "70%", maxWidth: 22, borderRadius: t.radius.xs, backgroundColor: t.colors.primary },
  value: { ...t.type.micro, color: t.colors.foreground, marginBottom: 3 },
  tick: { ...t.type.caption, ...t.font.regular, fontSize: TICK_SIZE, lineHeight: TICK_SIZE + 3, color: t.colors.foreground, marginTop: t.space.xs },
  tiles: { flexDirection: "row", gap: t.space.sm, marginTop: 14 },
  tile: { flex: 1, backgroundColor: t.colors.primarySoft, borderRadius: t.radius.md, padding: 10 },
  // caption, not the upper-case micro: three tiles share a row and an upper-case single word would break mid-word.
  tileLabel: { ...t.type.caption, color: t.colors.foreground },
  tileValue: { ...t.type.label, color: t.colors.foreground, marginTop: t.space.xxs },
});
