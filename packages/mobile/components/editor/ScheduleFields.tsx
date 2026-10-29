import React from "react";
import { Platform, Text, TextInput, View } from "react-native";
import { useLanguage } from "../../lib/language";
import { useFieldStyles } from "./field-styles";
import { NativeScheduleFields, type ScheduleFieldsProps } from "./NativeScheduleFields";

/**
 * Date and start-time fields. Native platforms open a date/time picker (value/onChange stay the
 * strings 'YYYY-MM-DD' / 'HH:mm'); web keeps plain text inputs.
 */
export function ScheduleFields(props: ScheduleFieldsProps) {
  return Platform.OS === "web" ? <WebScheduleFields {...props} /> : <NativeScheduleFields {...props} />;
}

function WebScheduleFields({ date, time, onDateChange, onTimeChange }: ScheduleFieldsProps) {
  const { t } = useLanguage();
  const s = useFieldStyles();
  return <View style={s.row}>
    <View style={{ flex: 1 }}><Text style={s.label}>{t("DATE")}</Text><TextInput value={date} onChangeText={onDateChange} placeholder="YYYY-MM-DD" style={s.input} accessibilityLabel={t("Date YYYY-MM-DD")} /></View>
    <View style={{ flex: 1 }}><Text style={s.label}>{t("START · 24H")}</Text><TextInput value={time} onChangeText={onTimeChange} placeholder="09:00" style={s.input} accessibilityLabel={t("Start time 24 hour")} /></View>
  </View>;
}
