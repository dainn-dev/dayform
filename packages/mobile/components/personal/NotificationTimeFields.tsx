import React, { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { pickerToTime, timeToPicker } from "../../lib/picker-values";
import { openAndroidPicker } from "../editor/android-picker";
import { PickerField } from "../editor/PickerField";

export type TimeFieldSpec = {
  id: string;
  /** Upper-case caption above the field (already translated). */
  label: string;
  accessibilityLabel: string;
  /** 'HH:mm' */
  value: string;
};

type Props = { fields: readonly TimeFieldSpec[]; onChange: (id: string, value: string) => void };

/**
 * A row of time fields that open the native picker: a dialog on Android, one inline spinner under the row on iOS.
 * Dismissing a picker changes nothing; a picker that cannot open leaves the value as it was.
 */
export function NotificationTimeFields({ fields, onChange }: Props) {
  const { language, locale, time: formatTime } = useLanguage();
  const { settings } = useSettings();
  const colors = useColors();
  const [openId, setOpenId] = useState<string | null>(null);
  const { timeFormat } = settings.calendar;
  const is24Hour = timeFormat === "24h" || (timeFormat === "auto" && language === "vi");
  const openField = fields.find(field => field.id === openId);

  const press = (field: TimeFieldSpec) => {
    if (Platform.OS !== "android") return setOpenId(current => (current === field.id ? null : field.id));
    openAndroidPicker({
      mode: "time", value: field.value, is24Hour,
      onSelect: value => onChange(field.id, value),
      onError: () => undefined,
    });
  };
  return <View>
    <View style={styles.row}>
      {fields.map(field => <PickerField key={field.id} label={field.label} display={formatTime(field.value)} icon="time-outline"
        accessibilityLabel={field.accessibilityLabel} isActive={openId === field.id} onPress={() => press(field)} />)}
    </View>
    {Platform.OS === "ios" && openField && <DateTimePicker mode="time" display="spinner" value={timeToPicker(openField.value, new Date())}
      locale={locale} textColor={colors.foreground} onValueChange={(_event, picked) => onChange(openField.id, pickerToTime(picked))} />}
  </View>;
}

const styles = StyleSheet.create({ row: { flexDirection: "row", gap: 12 } });
