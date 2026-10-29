import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import type { Status } from "../../lib/planner";
import { DurationField } from "./DurationField";
import { useFieldStyles } from "./field-styles";

const STATUSES: Status[] = ["todo", "in_progress", "done"];
// The duration field only holds up to four digits, so the status chips get the wider share:
// Vietnamese labels ("Đang làm") wrapped onto two lines in an equal split.
const DURATION_FLEX = 0.8;
const STATUS_FLEX = 1.2;
type Props = { duration: string; onDurationChange: (value: string) => void; status: Status; onStatusChange: (value: Status) => void };

export function DurationStatusRow({ duration, onDurationChange, status, onStatusChange }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const f = useFieldStyles();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const statusLabel = (v: Status) => t(v === "in_progress" ? "Doing" : v === "todo" ? "To do" : "Done");
  return <View style={f.row}>
    <View style={{ flex: DURATION_FLEX }}><Text numberOfLines={1} style={f.label}>{t("DURATION")}</Text>
      <DurationField minutes={duration} onChange={onDurationChange} />
    </View>
    <View style={{ flex: STATUS_FLEX }}>
      <Text numberOfLines={1} style={f.label}>{t("STATUS")}</Text>
      <View style={s.selectRow}>{STATUSES.map(v => <Pressable key={v} onPress={() => onStatusChange(v)} style={[s.miniChip, status === v && s.miniActive]} accessibilityRole="button" accessibilityState={{ selected: status === v }} accessibilityLabel={`${t("Status")} ${statusLabel(v)}`}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[s.miniText, status === v && s.miniTextActive]}>{statusLabel(v)}</Text></Pressable>)}</View>
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  selectRow: { height: 52, overflow: "hidden", borderRadius: 15, backgroundColor: c.card, flexDirection: "row", alignItems: "center", padding: 4, gap: 2 },
  miniChip: { flex: 1, alignItems: "center", justifyContent: "center", height: 44, borderRadius: 11 },
  miniActive: { backgroundColor: c.primaryTintStrong },
  miniText: { color: c.labelText, fontSize: 10, fontWeight: "700" },
  miniTextActive: { color: c.primary },
});
