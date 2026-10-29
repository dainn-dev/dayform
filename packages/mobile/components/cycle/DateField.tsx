import React, { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import { dateToPicker, pickerToDate } from "../../lib/picker-values";
import { openAndroidPicker } from "../editor/android-picker";
import { PickerField } from "../editor/PickerField";

type Props = {
  /** Upper-case caption (already translated). */
  label: string;
  accessibilityLabel: string;
  /** 'YYYY-MM-DD' */
  value: string;
  /** Latest selectable day on iOS; Android's dialog has no maximum, so the store's own check reports a future day. */
  maximumDate?: string;
  onChange: (value: string) => void;
};

/** A date field that opens the native picker: a dialog on Android, an inline calendar under the field on iOS. */
export function DateField({ label, accessibilityLabel, value, maximumDate, onChange }: Props) {
  const { locale } = useLanguage();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const press = () => {
    if (Platform.OS === "android") {
      openAndroidPicker({ mode: "date", value, is24Hour: true, onSelect: onChange, onError: () => undefined });
    } else {
      setOpen(current => !current);
    }
  };
  const now = new Date();
  return <View>
    <View style={{ flexDirection: "row" }}>
      <PickerField label={label} display={value} icon="calendar-outline" accessibilityLabel={accessibilityLabel} isActive={open} onPress={press} />
    </View>
    {Platform.OS === "ios" && open && <DateTimePicker mode="date" display="inline" value={dateToPicker(value, now)} locale={locale}
      accentColor={colors.primary} maximumDate={maximumDate === undefined ? undefined : dateToPicker(maximumDate, now)}
      onValueChange={(_event, picked) => onChange(pickerToDate(picked))} />}
  </View>;
}
