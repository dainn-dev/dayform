import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import type { CycleState } from "../../lib/cycle-model";
import { periodRows, type DialogTarget } from "../../lib/cycle-ui-actions";
import { tx } from "../../lib/cycle-ui-text";
import { useLanguage } from "../../lib/language";
import { CycleButton } from "./CycleButton";
import { CycleCard } from "./CycleCard";
import { useCycleFormat } from "./use-cycle-format";

type Props = { state: CycleState; today: string; onOpen: (target: DialogTarget) => void };

const SHOWN_ROWS = 12;

/** Logged periods, newest first, each with edit and delete. The newest 12 are listed. */
export function PeriodList({ state, today, onOpen }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const format = useCycleFormat();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const rows = useMemo(() => periodRows(state, today).slice(0, SHOWN_ROWS), [state, today]);

  return <CycleCard title={t("Logged periods")}>
    {rows.length === 0 && <Text style={s.empty}>{t("Nothing logged yet.")}</Text>}
    {rows.map(({ period, ongoing, days }) => {
      const range = ongoing
        ? format.sayText("{from}, still going", { from: format.withYear(period.start) })
        : format.sayText("{from} to {to}", { from: format.withYear(period.start), to: format.withYear(period.end ?? period.start) });
      const length = format.sayText(days === 1 ? tx("{count} day") : tx("{count} days"), { count: String(days) });
      return <View key={period.start} style={s.row}>
        <View style={s.texts} accessible>
          <Text style={s.range}>{range}</Text>
          <Text style={s.length}>{length}</Text>
        </View>
        <Pressable onPress={() => onOpen({ kind: "edit", period })} accessibilityRole="button" accessibilityLabel={format.sayText("Edit period starting {date}", { date: format.withYear(period.start) })} style={s.iconButton}>
          <Ionicons name="create-outline" size={20} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={() => onOpen({ kind: "remove", period })} accessibilityRole="button" accessibilityLabel={format.sayText("Delete period starting {date}", { date: format.withYear(period.start) })} style={s.iconButton}>
          <Ionicons name="trash-outline" size={20} color={colors.deleteText} />
        </Pressable>
      </View>;
    })}
    <View style={s.add}>
      <CycleButton variant="secondary" label={t("Add a past period")} onPress={() => onOpen({ kind: "edit", period: null })} />
    </View>
  </CycleCard>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  empty: { color: c.foreground, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline },
  texts: { flex: 1, paddingVertical: 6 },
  range: { color: c.foreground, fontSize: 13, fontWeight: "700" },
  length: { color: c.foreground, fontSize: 12, marginTop: 2 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  add: { marginTop: 12 },
});
