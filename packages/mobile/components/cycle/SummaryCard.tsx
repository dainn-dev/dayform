import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import type { CycleState } from "../../lib/cycle-model";
import { predict } from "../../lib/cycle-predict";
import { summaryOf } from "../../lib/cycle-ui-summary";
import { KindSymbol } from "./KindSymbol";
import { useCycleFormat } from "./use-cycle-format";

type Props = { state: CycleState; today: string };

/** "Next period expected …", "{n} days late" or a plain sentence for why nothing is predicted. */
export function SummaryCard({ state, today }: Props) {
  const colors = useColors();
  const format = useCycleFormat();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const view = useMemo(() => summaryOf(predict(state, today), state, format.short), [state, today, format.short]);
  const late = view.tone === "late";
  const headline = format.say(view.headline);
  const detail = view.detail === null ? null : format.say(view.detail);
  return <View style={[s.card, late && s.late]} accessible>
    <View style={s.icon}>
      {late
        ? <Ionicons name="time-outline" size={22} color={colors.warningIcon} />
        : view.tone === "next"
          ? <KindSymbol kind="predicted-period" size={18} />
          : <Ionicons name="information-circle-outline" size={22} color={colors.labelText} />}
    </View>
    <View style={s.texts}>
      <Text style={[s.headline, late && s.lateText]}>{headline}</Text>
      {detail !== null && <Text style={[s.detail, late && s.lateText]}>{detail}</Text>}
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: c.card, borderRadius: 20, padding: 18, marginBottom: 12 },
  late: { backgroundColor: c.warningBg },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.cycle.predicted.bg },
  texts: { flex: 1, gap: 4 },
  headline: { color: c.foreground, fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  detail: { color: c.foreground, fontSize: 13, lineHeight: 19 },
  lateText: { color: c.warningText },
});
