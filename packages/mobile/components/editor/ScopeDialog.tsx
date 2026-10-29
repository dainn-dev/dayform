import React, { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import type { EditScope } from "../../lib/recurrence";

type Props = {
  visible: boolean;
  mode: "edit" | "delete";
  onChoose: (scope: EditScope) => void;
  onCancel: () => void;
};

const SCOPES: readonly { scope: EditScope; label: string }[] = [
  { scope: "this", label: "This task only" },
  { scope: "following", label: "This and following tasks" },
  { scope: "all", label: "All tasks in the series" },
];

/** Asks which occurrences of a repeating task an edit or delete applies to. */
export function ScopeDialog({ visible, mode, onChoose, onCancel }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const isDelete = mode === "delete";
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={s.center}>
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onCancel} accessibilityLabel={t("Cancel")} />
      <View style={s.card} accessibilityViewIsModal>
        <Text style={s.title} accessibilityRole="header">{t(isDelete ? "Delete repeating task" : "Edit repeating task")}</Text>
        <Text style={s.message}>{t("Which tasks should this change apply to?")}</Text>
        {SCOPES.map(({ scope, label }) => <Pressable key={scope} onPress={() => onChoose(scope)} accessibilityRole="button" style={s.option}>
          <Text style={[s.optionText, isDelete && s.destructive]}>{t(label)}</Text>
        </Pressable>)}
        <Pressable onPress={onCancel} accessibilityRole="button" style={s.cancel}><Text style={s.cancelText}>{t("Cancel")}</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  scrim: { backgroundColor: c.foreground, opacity: 0.45 },
  card: { backgroundColor: c.card, borderRadius: 22, padding: 22, gap: 10 },
  title: { color: c.foreground, fontSize: 18, fontWeight: "800" },
  message: { color: c.labelText, fontSize: 13, marginBottom: 6 },
  option: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: c.inputBorder, backgroundColor: c.background, justifyContent: "center", paddingHorizontal: 16 },
  optionText: { color: c.foreground, fontSize: 14, fontWeight: "700" },
  destructive: { color: c.deleteText },
  cancel: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { color: c.labelText, fontSize: 13, fontWeight: "700" },
});
