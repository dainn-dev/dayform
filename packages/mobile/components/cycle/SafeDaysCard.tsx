import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import type { CycleState } from "../../lib/cycle-model";
import { predict } from "../../lib/cycle-predict";
import { safeDaysView } from "../../lib/cycle-ui-summary";
import { useLanguage } from "../../lib/language";
import { CycleCard } from "./CycleCard";
import { KindSymbol } from "./KindSymbol";
import { useCycleFormat } from "./use-cycle-format";

/**
 * "Safe days (estimate)". The method and the dates appear only when the prediction produced a method; the
 * disclaimer is always right next to them. Otherwise the card says in a plain sentence why there is nothing.
 */
export function SafeDaysCard({ state, today }: { state: CycleState; today: string }) {
  const { t } = useLanguage();
  const colors = useColors();
  const format = useCycleFormat();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const view = useMemo(() => safeDaysView(predict(state, today).safeDays, format.short, t), [state, today, format.short, t]);

  return <CycleCard title={t("Safe days (estimate)")}>
    {view.visible
      ? <View style={s.body}>
          <View style={s.disclaimer} accessibilityRole="alert">
            <Text style={s.disclaimerText}>{t("This is an estimate, not contraception. It can be wrong. Do not rely on it to prevent pregnancy.")}</Text>
          </View>
          <Text style={s.text}>{format.say(view.method)}</Text>
          <View style={s.rangeRow}>
            <KindSymbol kind="fertile" size={12} />
            <Text style={[s.text, s.flex]}>{format.say(view.fertileRange)}</Text>
          </View>
          <View style={s.rangeRow}>
            <KindSymbol kind="safe-estimate" size={12} />
            <Text style={[s.text, s.flex]}>{format.say(view.others)}</Text>
          </View>
        </View>
      : <Text style={s.text}>{format.say(view.reason)}</Text>}
  </CycleCard>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  body: { gap: 10 },
  flex: { flex: 1 },
  text: { color: c.foreground, fontSize: 13, lineHeight: 19 },
  rangeRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  disclaimer: { backgroundColor: c.warningBg, borderRadius: 12, padding: 12 },
  disclaimerText: { color: c.warningText, fontSize: 13, lineHeight: 19, fontWeight: "700" },
});
