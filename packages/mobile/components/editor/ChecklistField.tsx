import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { MAX_CHECKLIST_ITEMS, MAX_CHECKLIST_TEXT, type ChecklistItem } from "../../lib/planner";
import { useFieldStyles } from "./field-styles";
import { useRevealOnFocus } from "./reveal-context";

type Props = { value: ChecklistItem[]; onChange: (value: ChecklistItem[]) => void };

const TOUCH_TARGET = 44;

/** The steps of a task: tick, rename or remove each one, and add more below. Blank steps are dropped on save. */
export function ChecklistField({ value, onChange }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const field = useFieldStyles();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const revealOnFocus = useRevealOnFocus();
  const [draft, setDraft] = useState("");

  const replace = (index: number, patch: Partial<ChecklistItem>) => onChange(value.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => {
    const text = draft.trim();
    if (text === "" || value.length >= MAX_CHECKLIST_ITEMS) return;
    onChange([...value, { text, done: false }]);
    setDraft("");
  };
  const full = value.length >= MAX_CHECKLIST_ITEMS;

  return <>
    <Text style={field.label}>{t("STEPS · OPTIONAL")}</Text>
    <View style={s.box}>
      {value.map((step, index) => <View key={index} style={s.row}>
        <Pressable onPress={() => replace(index, { done: !step.done })} accessibilityRole="checkbox" accessibilityState={{ checked: step.done }}
          accessibilityLabel={`${step.done ? t("Untick") : t("Tick")} ${step.text}`} style={s.target}>
          <View style={[s.check, step.done && s.checkOn]}><Ionicons name="checkmark" size={14} color={step.done ? colors.onPrimary : "transparent"} /></View>
        </Pressable>
        <TextInput value={step.text} onChangeText={text => replace(index, { text })} onFocus={revealOnFocus} maxLength={MAX_CHECKLIST_TEXT}
          accessibilityLabel={t("Step")} style={[s.text, step.done && s.textDone]} />
        <Pressable onPress={() => remove(index)} accessibilityRole="button" accessibilityLabel={`${t("Remove step")} ${step.text}`} style={s.target}>
          <Ionicons name="close" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>)}
      <View style={s.row}>
        <View style={s.target}><Ionicons name="add" size={20} color={colors.primary} /></View>
        <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={add} onBlur={add} onFocus={revealOnFocus} editable={!full} maxLength={MAX_CHECKLIST_TEXT}
          blurOnSubmit={false} returnKeyType="done" accessibilityLabel={t("Add a step")} placeholder={full ? t("That is the most steps") : t("Add a step")}
          placeholderTextColor={colors.placeholder} style={s.text} />
      </View>
    </View>
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  box: { backgroundColor: c.card, borderRadius: 15, borderWidth: 1, borderColor: c.inputBorder, paddingHorizontal: 6, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center" },
  target: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.checkBorder, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: c.primary, borderColor: c.primary },
  text: { flex: 1, minHeight: TOUCH_TARGET, color: c.foreground, fontSize: 15, paddingVertical: 8 },
  textDone: { textDecorationLine: "line-through", color: c.mutedForeground },
});
