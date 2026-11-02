import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { IconButton } from "../ui/IconButton";
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
  const saveLabel = saving ? t("Saving...") : confirmConflict ? t("Save anyway") : isEditing ? t("Save changes") : t("Add task");
  // Delete on the left (editing only), the main action filling the rest. Both say what they do in words.
  return <View style={s.row}>
    {isEditing && <IconButton icon="trash-outline" text={t("Delete")} tone="danger" label={t("Delete task")} disabled={saving} onPress={onDelete} style={s.delete} />}
    <IconButton icon={confirmConflict ? "warning-outline" : "checkmark"} text={saveLabel} tone="primary" label={saveLabel} busy={saving} onPress={onSave} style={s.save} />
  </View>;
}

const makeStyles = (_c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  delete: { paddingHorizontal: 18 },
  save: { flex: 1 },
});
