import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import type { Status } from "../../lib/planner";
import { DurationField } from "./DurationField";
import { FIELD_HEIGHT, useFieldStyles } from "./field-styles";

const STATUSES: Status[] = ["todo", "in_progress", "done"];
// The duration field only holds up to four digits, so the status chips get the wider share:
// Vietnamese labels ("Đang làm") wrapped onto two lines in an equal split.
const DURATION_FLEX = 0.8;
const STATUS_FLEX = 1.2;
type Props = { duration: string; onDurationChange: (value: string) => void; status: Status; onStatusChange: (value: Status) => void };

export function DurationStatusRow({ duration, onDurationChange, status, onStatusChange }: Props) {
  const { t } = useLanguage();
  const f = useFieldStyles();
  const s = useThemedStyles(makeStyles);
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

/** Each status is a full 44 px target; the 1 px border and a small inset fill the field height around it. */
const SEGMENT_HEIGHT = 44;
const SEGMENT_INSET = (FIELD_HEIGHT - 2 - SEGMENT_HEIGHT) / 2;

const makeStyles = ({ colors: c, radius, space, type, font }: Theme) => StyleSheet.create({
  // Drawn like the duration input beside it (same height, corner and border), so the two read as one row.
  selectRow: {
    height: FIELD_HEIGHT, overflow: "hidden", borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder,
    flexDirection: "row", alignItems: "center", padding: SEGMENT_INSET, gap: space.xxs,
  },
  miniChip: { flex: 1, alignItems: "center", justifyContent: "center", height: SEGMENT_HEIGHT, borderRadius: Math.max(radius.xs, radius.md - SEGMENT_INSET), paddingHorizontal: space.xxs },
  miniActive: { backgroundColor: c.primaryTintStrong },
  miniText: { ...type.caption, ...font.bold, color: c.labelText },
  miniTextActive: { color: c.primary },
});
