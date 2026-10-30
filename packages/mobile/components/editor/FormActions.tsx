import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

type Props = {
  saving: boolean;
  /** True when editing an existing task (shows "Save changes" and the delete button). */
  isEditing: boolean;
  confirmConflict: boolean;
  onSave: () => void;
  onDelete: () => void;
};

export function FormActions({ saving, isEditing, confirmConflict, onSave, onDelete }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  // One row: delete (outlined, as wide as its label) on the left, the main action fills the rest on the right.
  return <View style={s.row}>
    {isEditing && <Pressable onPress={onDelete} disabled={saving} accessibilityRole="button" accessibilityLabel={t("Delete task")} style={[s.delete, saving && s.disabled]}><Ionicons name="trash-outline" size={17} color={colors.deleteText} /><Text numberOfLines={1} style={s.deleteText}>{t("Delete task")}</Text></Pressable>}
    <Pressable onPress={onSave} disabled={saving} accessibilityRole="button" accessibilityState={{ disabled: saving, busy: saving }} style={s.save}><Text numberOfLines={1} style={s.saveText}>{saving ? t("Saving...") : confirmConflict ? t("Save anyway") : isEditing ? t("Save changes") : t("Add task")}</Text><Ionicons name="arrow-forward" size={18} color={colors.onPrimary} /></Pressable>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "stretch", gap: 10, marginTop: 12 },
  save: { flex: 1, minWidth: 0, backgroundColor: c.primary, height: 48, borderRadius: 15, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { flexShrink: 1, color: c.onPrimary, fontSize: 15, fontWeight: "800" },
  delete: { flexShrink: 0, height: 48, borderRadius: 15, borderWidth: 1, borderColor: c.deleteText, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  deleteText: { color: c.deleteText, fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
