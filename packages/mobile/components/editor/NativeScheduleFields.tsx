import React, { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import { dateToPicker, pickerToDate, pickerToTime, timeToPicker } from "../../lib/picker-values";
import { useFieldStyles } from "./field-styles";
import { openAndroidPicker } from "./android-picker";
import { PickerField } from "./PickerField";

export type ScheduleFieldsProps = {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  /** Called when the native picker could not be opened. */
  onPickerError?: () => void;
};

type OpenPicker = "date" | "time" | null;

/** Date and time fields that open the platform picker: a dialog on Android, an inline picker on iOS. */
export function NativeScheduleFields({ date, time, onDateChange, onTimeChange, onPickerError }: ScheduleFieldsProps) {
  const { t, locale, time: formatTime, timeFormat } = useLanguage();
  const colors = useColors();
  const f = useFieldStyles();
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const is24Hour = timeFormat === "24h";

  const openAndroid = (mode: "date" | "time") => openAndroidPicker({
    mode, value: mode === "date" ? date : time, is24Hour,
    onSelect: mode === "date" ? onDateChange : onTimeChange,
    onError: () => onPickerError?.(),
  });
  const press = (mode: "date" | "time") => {
    if (Platform.OS === "android") openAndroid(mode);
    else setOpenPicker(current => (current === mode ? null : mode));
  };
  const now = new Date();
  return <>
    <View style={f.row}>
      <PickerField label={t("DATE")} display={date} icon="calendar-outline" accessibilityLabel={t("Date YYYY-MM-DD")} isActive={openPicker === "date"} onPress={() => press("date")} />
      <PickerField label={is24Hour ? t("START · 24H") : t("START")} display={formatTime(time)} icon="time-outline" accessibilityLabel={is24Hour ? t("Start time 24 hour") : t("Start time")} isActive={openPicker === "time"} onPress={() => press("time")} />
    </View>
    {Platform.OS === "ios" && openPicker === "date" && <DateTimePicker mode="date" display="inline" value={dateToPicker(date, now)} locale={locale} accentColor={colors.primary} onValueChange={(_event, picked) => onDateChange(pickerToDate(picked))} />}
    {Platform.OS === "ios" && openPicker === "time" && <DateTimePicker mode="time" display="spinner" value={timeToPicker(time, now)} locale={locale} textColor={colors.foreground} onValueChange={(_event, picked) => onTimeChange(pickerToTime(picked))} />}
  </>;
}
