import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { MAX_ROUTINE_NAME, type Routine } from "../../lib/routines";
import { useRoutines } from "../../lib/routines-context";

/** "Routines": rename or delete the saved routines. They are made from a day on the Timeline (the layers button). */
export function RoutinesSection() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
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
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hint: { color: c.mutedForeground, fontSize: 13, lineHeight: 19 },
  error: { color: c.errorBannerText, fontSize: 12, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  fields: { flex: 1, minWidth: 0 },
  name: { color: c.foreground, fontSize: 15, fontWeight: "700", minHeight: 40, paddingVertical: 6 },
  meta: { color: c.mutedForeground, fontSize: 12 },
  delete: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
