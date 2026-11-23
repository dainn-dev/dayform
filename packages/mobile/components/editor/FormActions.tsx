import React from "react";
import { StyleSheet, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { Button } from "../ui/Button";
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
  const s = useThemedStyles(makeStyles);
  const saveLabel = saving ? t("Saving...") : confirmConflict ? t("Save anyway") : isEditing ? t("Save changes") : t("Add task");
  // Delete on the left (editing only), the main action filling the rest. Both say what they do in words.
  return <View style={s.row}>
    {isEditing && <Button label={t("Delete")} accessibilityLabel={t("Delete task")} variant="danger" disabled={saving} onPress={onDelete} />}
    <Button label={saveLabel} variant="primary" busy={saving} onPress={onSave} style={s.save} />
  </View>;
}

const makeStyles = ({ space }: Theme) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: space.md },
  save: { flex: 1 },
});
