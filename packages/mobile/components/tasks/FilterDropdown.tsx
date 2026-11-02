import React, { memo, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import type { ThemeColors } from "../../constants/theme";
import { IconButton } from "../ui/IconButton";

const FIELD_HEIGHT = 48;
const OPTION_HEIGHT = 48;
const SHEET_MAX_HEIGHT = "70%";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type DropdownOption = {
  key: string;
  label: string;
  icon?: IconName;
  /** Accent for the icon and the checkmark while selected. */
  accent?: string;
};

type Props = {
  /** Sheet title, also part of the accessibility label of the field. */
  title: string;
  /** Text shown inside the closed field. */
  valueLabel: string;
  icon: IconName;
  options: readonly DropdownOption[];
  selected: readonly string[];
  /** Multi-select keeps the sheet open and adds an "Apply" button; single-select closes on pick. */
  multi?: boolean;
  /** When set, the first row clears the selection (shown selected while nothing else is). */
  allLabel?: string;
  /** True when the field differs from its default, so it is tinted like an active filter. */
  active: boolean;
  onPick: (key: string) => void;
  onClear?: () => void;
};

/** A filter field that opens a sheet of options. Used for the status and category filters of the Tasks tab. */
export const FilterDropdown = memo(function FilterDropdown({ title, valueLabel, icon, options, selected, multi = false, allLabel, active, onPick, onClear }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const pick = (key: string) => { onPick(key); if (!multi) close(); };
  const clear = () => { onClear?.(); if (!multi) close(); };
  return <>
    <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${title}: ${valueLabel}`} accessibilityState={{ expanded: open }}
      style={[s.field, active && s.fieldActive]}>
      <Ionicons name={icon} size={17} color={active ? colors.primary : colors.mutedForeground} />
      <Text numberOfLines={1} style={[s.fieldText, active && s.fieldTextActive]}>{valueLabel}</Text>
      <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={s.center}>
        <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={close} accessible={false} importantForAccessibility="no" />
        <View style={s.sheet} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={s.title}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
            {allLabel !== undefined && <Row label={allLabel} icon="apps-outline" on={selected.length === 0} multi={false} onPress={clear} styles={s} colors={colors} />}
            {options.map(option => <Row key={option.key} label={option.label} icon={option.icon} accent={option.accent} on={selected.includes(option.key)} multi={multi} onPress={() => pick(option.key)} styles={s} colors={colors} />)}
          </ScrollView>
          {multi && <IconButton icon="checkmark" tone="primary" label={t("Apply")} onPress={close} style={s.apply} />}
        </View>
      </View>
    </Modal>
  </>;
});

type RowProps = {
  label: string;
  icon?: IconName;
  accent?: string;
  on: boolean;
  multi: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
};

function Row({ label, icon, accent, on, multi, onPress, styles: s, colors }: RowProps) {
  const tint = on ? accent ?? colors.primary : colors.mutedForeground;
  return <Pressable onPress={onPress} accessibilityRole={multi ? "checkbox" : "radio"} accessibilityState={multi ? { checked: on } : { selected: on }} style={[s.option, on && s.optionOn]}>
    {icon && <Ionicons name={icon} size={18} color={tint} />}
    <Text numberOfLines={1} style={[s.optionText, on && s.optionTextOn]}>{label}</Text>
    {on && <Ionicons name="checkmark" size={20} color={tint} />}
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  field: { flex: 1, minHeight: FIELD_HEIGHT, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.card, borderWidth: 2, borderColor: "transparent", borderRadius: 14, paddingHorizontal: 13 },
  fieldActive: { backgroundColor: c.primaryTint, borderColor: c.primary },
  fieldText: { flex: 1, color: c.mutedForeground, fontSize: 13, fontWeight: "700" },
  fieldTextActive: { color: c.foreground },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  scrim: { backgroundColor: c.scrim },
  sheet: { backgroundColor: c.card, borderRadius: 22, padding: 18, gap: 10, maxHeight: SHEET_MAX_HEIGHT },
  title: { color: c.foreground, fontSize: 17, fontWeight: "800", marginLeft: 4, marginBottom: 2 },
  list: { gap: 6 },
  option: { minHeight: OPTION_HEIGHT, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, paddingHorizontal: 14 },
  optionOn: { backgroundColor: c.background },
  optionText: { flex: 1, color: c.mutedForeground, fontSize: 14, fontWeight: "700" },
  optionTextOn: { color: c.foreground },
  apply: { alignSelf: "flex-end" },
});
