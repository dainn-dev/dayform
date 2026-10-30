import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import { pickerToTime, timeToPicker } from "../../lib/picker-values";
import { openAndroidPicker } from "../editor/android-picker";
import { useFieldStyles } from "../editor/field-styles";
import { PickerField } from "../editor/PickerField";

type Props = { value: string; onChange: (time: string) => void; onPickerError: () => void };

/** The shared editor field label carries a 19 px top margin; trim it to ~12 px to match the other captions on this page. */
const LABEL_TOP_TRIM = -7;
const s = StyleSheet.create({ root: { marginTop: LABEL_TOP_TRIM } });

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The fixed start time: a native dialog on Android, an inline spinner on iOS, a plain text input on web. */
export function DefaultStartTimeField({ value, onChange, onPickerError }: Props) {
  const { t, timeFormat, locale, time: formatTime } = useLanguage();
  const colors = useColors();
  const f = useFieldStyles();
  const [spinnerOpen, setSpinnerOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const label = timeFormat === "24h" ? t("FIXED START · 24H") : t("FIXED START");

  if (Platform.OS === "web") {
    const typed = (text: string) => { setDraft(text); if (TIME_PATTERN.test(text)) onChange(text); };
    return <View style={s.root}><Text style={f.label}>{label}</Text><TextInput value={draft} onChangeText={typed} placeholder="09:00" style={f.input} accessibilityLabel={t("Default start time")} /></View>;
  }
  const press = () => {
    if (Platform.OS !== "android") return setSpinnerOpen(open => !open);
    openAndroidPicker({ mode: "time", value, is24Hour: timeFormat === "24h", onSelect: onChange, onError: onPickerError });
  };
  return <View style={s.root}>
    <View style={f.row}>
      <PickerField label={label} display={formatTime(value)} icon="time-outline" accessibilityLabel={t("Default start time")} isActive={spinnerOpen} onPress={press} />
      <View style={{ flex: 1 }} />
    </View>
    {Platform.OS === "ios" && spinnerOpen && <DateTimePicker mode="time" display="spinner" value={timeToPicker(value, new Date())} locale={locale} textColor={colors.foreground} onValueChange={(_event, picked) => onChange(pickerToTime(picked))} />}
  </View>;
}
