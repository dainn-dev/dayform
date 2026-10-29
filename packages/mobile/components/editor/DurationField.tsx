import React, { useMemo, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { hoursTextToMinutesText, minutesToHoursText, toggleUnit, type DurationUnit } from "../../lib/duration-input";
import { useFieldStyles } from "./field-styles";

const MINUTES_MAX_LENGTH = 4;
const HOURS_MAX_LENGTH = 5;
const UNIT_ICON_SIZE = 14;

type Props = {
  /** The duration in whole minutes, as typed. The editor always works in minutes. */
  minutes: string;
  onChange: (minutes: string) => void;
};

/**
 * Duration input with its unit inside the field. Tapping the unit switches between minutes and hours;
 * hours accept decimals ("1.5") and are converted back to whole minutes for the editor.
 */
export function DurationField({ minutes, onChange }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const f = useFieldStyles();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [unit, setUnit] = useState<DurationUnit>("min");
  const [hoursDraft, setHoursDraft] = useState("");
  const inHours = unit === "hr";
  // The draft is what the user typed; when the minutes changed from outside (a habit hint), show them instead.
  const shownHours = hoursTextToMinutesText(hoursDraft) === minutes ? hoursDraft : minutesToHoursText(minutes);

  const handleChange = (text: string): void => {
    if (!inHours) {
      onChange(text);
      return;
    }
    // Keep what was typed ("1." while typing 1.5) and report the minutes it stands for.
    setHoursDraft(text);
    onChange(hoursTextToMinutesText(text));
  };

  const handleToggle = (): void => {
    const next = toggleUnit(unit);
    if (next === "hr") setHoursDraft(minutesToHoursText(minutes));
    setUnit(next);
  };

  return <View>
    <TextInput
      value={inHours ? shownHours : minutes}
      onChangeText={handleChange}
      keyboardType={inHours ? "decimal-pad" : "number-pad"}
      returnKeyType="done"
      onSubmitEditing={Keyboard.dismiss}
      maxLength={inHours ? HOURS_MAX_LENGTH : MINUTES_MAX_LENGTH}
      style={[f.input, s.input]}
      accessibilityLabel={t(inHours ? "Duration in hours" : "Duration in minutes")}
    />
    <Pressable
      onPress={handleToggle}
      accessibilityRole="button"
      accessibilityLabel={t(inHours ? "Show duration in minutes" : "Show duration in hours")}
      style={s.unitButton}
    >
      <Text style={s.unitText}>{t(inHours ? "hr" : "min")}</Text>
      <Ionicons name="swap-vertical" size={UNIT_ICON_SIZE} color={colors.primary} />
    </Pressable>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  // The unit button sits inside the field, so the input keeps room on the right for it.
  input: { paddingRight: 78 },
  unitButton: { position: "absolute", right: 0, top: 0, bottom: 0, minWidth: 64, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  unitText: { color: c.primary, fontSize: 13, fontWeight: "700" },
});
