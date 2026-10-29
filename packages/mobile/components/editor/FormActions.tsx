import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
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
  return <>
    <Pressable onPress={onSave} disabled={saving} accessibilityRole="button" accessibilityState={{ disabled: saving, busy: saving }} style={s.save}><Text style={s.saveText}>{saving ? t("Saving...") : confirmConflict ? t("Save anyway") : isEditing ? t("Save changes") : t("Add task")}</Text><Ionicons name="arrow-forward" size={19} color={colors.onPrimary} /></Pressable>
    {isEditing && <Pressable onPress={onDelete} disabled={saving} accessibilityRole="button" accessibilityLabel={t("Delete task")} style={s.delete}><Ionicons name="trash-outline" size={17} color={colors.deleteText} /><Text style={s.deleteText}>{t("Delete task")}</Text></Pressable>}
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  save: { backgroundColor: c.primary, height: 56, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 28 },
  saveText: { color: c.onPrimary, fontSize: 15, fontWeight: "800" },
  delete: { height: 52, borderRadius: 17, borderWidth: 1, borderColor: c.deleteText, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 },
  deleteText: { color: c.deleteText, fontSize: 14, fontWeight: "700" },
});
