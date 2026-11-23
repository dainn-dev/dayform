import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import type { CycleState } from "../../lib/cycle-model";
import { predict } from "../../lib/cycle-predict";
import { summaryOf } from "../../lib/cycle-ui-summary";
import { Surface } from "../ui/Surface";
import { KindSymbol } from "./KindSymbol";
import { useCycleFormat } from "./use-cycle-format";

type Props = { state: CycleState; today: string };

const ICON_BOX = 36;

/** "Next period expected …", "{n} days late" or a plain sentence for why nothing is predicted. */
export function SummaryCard({ state, today }: Props) {
  const { colors } = useTheme();
  const format = useCycleFormat();
  const s = useThemedStyles(makeStyles);
  const view = useMemo(() => summaryOf(predict(state, today), state, format.short), [state, today, format.short]);
  const late = view.tone === "late";
  const headline = format.say(view.headline);
  const detail = view.detail === null ? null : format.say(view.detail);
  return <Surface padding="none" style={[s.card, late && s.late]} accessible>
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
  </Surface>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, marginBottom: t.space.md },
  late: { backgroundColor: t.colors.warningBg },
  icon: { width: ICON_BOX, height: ICON_BOX, borderRadius: t.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.cycle.predicted.bg },
  texts: { flex: 1, gap: t.space.xs },
  headline: { ...t.type.title, color: t.colors.foreground },
  detail: { ...t.type.body, color: t.colors.foreground },
  lateText: { color: t.colors.warningText },
});
