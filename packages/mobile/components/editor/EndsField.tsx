import React, { useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import { dateToPicker, pickerToDate } from "../../lib/picker-values";
import { openAndroidPicker } from "./android-picker";
import { ChoiceChips, type Choice } from "./ChoiceChips";
import { useFieldStyles } from "./field-styles";
import { PickerField } from "./PickerField";

type Props = {
  /** The repeat's last day ('YYYY-MM-DD'), or null for "never ends". */
  until: string | null;
  /** The task's own date: the earliest possible end date, and the first value of a new end date. */
  taskDate: string;
  onChange: (until: string | null) => void;
  /** Called when the native picker could not be opened. */
  onPickerError?: () => void;
};

type EndsMode = "never" | "date";

const CHOICES: readonly Choice<EndsMode>[] = [
  { value: "never", label: "Never" },
  { value: "date", label: "On date" },
];

/**
 * The "Ends" row of a repeating task: Never, or On date (the native date picker, not before the task
 * date; web keeps a plain text input like the schedule fields). The shell only mounts it with a repeat.
 */
export function EndsField({ until, taskDate, onChange, onPickerError }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const f = useFieldStyles();
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const mode: EndsMode = until === null ? "never" : "date";

  const openPicker = (current: string) => {
    if (Platform.OS === "android") {
      openAndroidPicker({ mode: "date", value: current, is24Hour: true, minimumDate: taskDate, onSelect: onChange, onError: () => onPickerError?.() });
    } else if (Platform.OS === "ios") {
      setIosPickerOpen(open => !open);
    }
  };
  const choose = (next: EndsMode) => {
    if (next === "never") {
      setIosPickerOpen(false);
      return onChange(null);
    }
    const current = until ?? taskDate;
    if (until === null) onChange(current);
    openPicker(current);
  };
  const choices = CHOICES.map(choice => ({ ...choice, label: t(choice.label) }));
  return <>
    <Text style={f.label}>{t("ENDS")}</Text>
    <ChoiceChips choices={choices} value={mode} onChange={choose} />
    {until !== null && Platform.OS === "web" && <View style={f.row}>
      <View style={{ flex: 1 }}>
        <Text style={f.label}>{t("END DATE")}</Text>
        <TextInput value={until} onChangeText={onChange} placeholder="YYYY-MM-DD" style={f.input} accessibilityLabel={t("End date YYYY-MM-DD")} />
      </View>
    </View>}
    {until !== null && Platform.OS !== "web" && <View style={f.row}>
      <PickerField label={t("END DATE")} display={until} icon="calendar-outline" accessibilityLabel={t("End date YYYY-MM-DD")} isActive={iosPickerOpen} onPress={() => openPicker(until)} />
    </View>}
    {Platform.OS === "ios" && iosPickerOpen && until !== null && (
      <DateTimePicker mode="date" display="inline" value={dateToPicker(until, new Date())} minimumDate={dateToPicker(taskDate, new Date())} accentColor={colors.primary} onValueChange={(_event, picked) => onChange(pickerToDate(picked))} />
    )}
  </>;
}
