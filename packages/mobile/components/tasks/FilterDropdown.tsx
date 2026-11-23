import React, { memo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
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
  /** Left of the value; leave out when the value says it all (a Week / Month choice). */
  icon?: IconName;
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
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const pick = (key: string) => { onPick(key); if (!multi) close(); };
  const clear = () => { onClear?.(); if (!multi) close(); };
  return <>
    <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${title}: ${valueLabel}`} accessibilityState={{ expanded: open }}
      style={[s.field, active && s.fieldActive]}>
      {icon !== undefined && <Ionicons name={icon} size={17} color={active ? colors.primary : colors.mutedForeground} />}
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

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    // The 2 px transparent border keeps the text still when the active border appears (Dayform); in the bordered
    // styles the card depth that follows replaces it with the style's 1 px line.
    field: { flex: 1, minHeight: FIELD_HEIGHT, flexDirection: "row", alignItems: "center", gap: t.space.sm, backgroundColor: c.card, borderWidth: 2, borderColor: "transparent", ...t.elevation.card, borderRadius: t.radius.md, paddingHorizontal: 13 },
    fieldActive: { backgroundColor: c.primaryTint, borderColor: c.primary, borderWidth: 2 },
    fieldText: { ...t.type.label, flex: 1, color: c.mutedForeground },
    fieldTextActive: { color: c.foreground },
    center: { flex: 1, justifyContent: "center", paddingHorizontal: t.space.xxl },
    scrim: { backgroundColor: c.scrim },
    sheet: { ...t.elevation.overlay, backgroundColor: c.card, borderRadius: t.radius.xl, padding: 18, gap: 10, maxHeight: SHEET_MAX_HEIGHT },
    title: { ...t.type.title, color: c.foreground, marginLeft: t.space.xs, marginBottom: t.space.xxs },
    list: { gap: 6 },
    option: { minHeight: OPTION_HEIGHT, flexDirection: "row", alignItems: "center", gap: t.space.md, borderRadius: t.radius.md, paddingHorizontal: 14 },
    optionOn: { backgroundColor: c.background },
    optionText: { ...t.type.body, ...t.font.bold, flex: 1, color: c.mutedForeground },
    optionTextOn: { color: c.foreground },
    apply: { alignSelf: "flex-end" },
  });
};
