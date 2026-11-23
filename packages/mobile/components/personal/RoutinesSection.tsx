import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { MAX_ROUTINE_NAME, type Routine } from "../../lib/routines";
import { useRoutines } from "../../lib/routines-context";

/** "Routines": rename or delete the saved routines. They are made from a day on the Timeline (the layers button). */
export function RoutinesSection() {
  const { t } = useLanguage();
  const s = useThemedStyles(makeStyles);
  const { items, locked, saveError } = useRoutines();
  return <View>
    {items.length === 0
      ? <Text style={s.hint}>{t("No routines yet. On the Timeline, open Routines and save a day you like.")}</Text>
      : items.map(routine => <RoutineRow key={routine.id} routine={routine} />)}
    {(locked || saveError) && <Text style={s.error}>{t(locked ? "Routines could not be loaded, so they cannot be changed now. Try reopening the app." : "Your change could not be saved. Please try again.")}</Text>}
  </View>;
}

function RoutineRow({ routine }: { routine: Routine }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { rename, remove } = useRoutines();
  const [name, setName] = useState(routine.name);
  const commit = () => {
    if (name.trim() === "") setName(routine.name);
    else if (name.trim() !== routine.name) void rename(routine.id, name);
  };
  return <View style={s.row}>
    <View style={s.fields}>
      <TextInput value={name} onChangeText={setName} onEndEditing={commit} onSubmitEditing={commit} maxLength={MAX_ROUTINE_NAME} accessibilityLabel={t("Routine name")} style={s.name} />
      <Text style={s.meta}>{`${routine.items.length} ${t(routine.items.length === 1 ? "task" : "tasks")}`}</Text>
    </View>
    <Pressable onPress={() => void remove(routine.id)} accessibilityRole="button" accessibilityLabel={`${t("Delete routine")} ${routine.name}`} style={s.delete}>
      <Ionicons name="trash-outline" size={20} color={colors.deleteText} />
    </Pressable>
  </View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    hint: { ...t.type.body, color: c.mutedForeground },
    error: { ...t.type.meta, ...t.font.regular, color: c.errorBannerText, marginTop: t.space.sm },
    row: { flexDirection: "row", alignItems: "center", gap: t.space.sm, paddingVertical: t.space.xs },
    fields: { flex: 1, minWidth: 0 },
    name: { ...t.type.subtitle, color: c.foreground, minHeight: 40, paddingVertical: t.space.xs + 2 },
    meta: { ...t.type.meta, color: c.mutedForeground },
    delete: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  });
};
