import React, { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import type { EditScope } from "../../lib/recurrence";

type Props = {
  visible: boolean;
  /** Keep passing the last mode while the dialog fades out, so the title does not flicker. */
  mode: "edit" | "delete";
  /** Scopes offered to the user (see `allowedScopes`). */
  scopes: readonly EditScope[];
  /** True while a change is being committed: the options cannot be tapped again. */
  disabled: boolean;
  onChoose: (scope: EditScope) => void;
  onCancel: () => void;
};

const SCOPE_LABELS: Record<EditScope, string> = {
  this: "This task only",
  following: "This and following tasks",
  all: "All tasks in the series",
};
const SCOPE_ORDER: readonly EditScope[] = ["this", "following", "all"];

/** Asks which occurrences of a repeating task an edit or delete applies to. */
export function ScopeDialog({ visible, mode, scopes, disabled, onChoose, onCancel }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const isDelete = mode === "delete";
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
    <View style={s.center}>
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onCancel} accessible={false} importantForAccessibility="no" />
      <View style={s.card} accessibilityViewIsModal>
        <Text style={s.title} accessibilityRole="header">{t(isDelete ? "Delete repeating task" : "Edit repeating task")}</Text>
        <Text style={s.message}>{t("Which tasks should this change apply to?")}</Text>
        {SCOPE_ORDER.filter(scope => scopes.includes(scope)).map(scope => <Pressable key={scope} onPress={() => onChoose(scope)} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[s.option, disabled && s.disabled]}>
          <Text style={[s.optionText, isDelete && s.destructive]}>{t(SCOPE_LABELS[scope])}</Text>
        </Pressable>)}
        <Pressable onPress={onCancel} disabled={disabled} accessibilityRole="button" style={s.cancel}><Text style={s.cancelText}>{t("Cancel")}</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  scrim: { backgroundColor: c.scrim },
  card: { backgroundColor: c.card, borderRadius: 22, padding: 22, gap: 10 },
  title: { color: c.foreground, fontSize: 18, fontWeight: "800" },
  message: { color: c.labelText, fontSize: 13, marginBottom: 6 },
  option: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: c.inputBorder, backgroundColor: c.background, justifyContent: "center", paddingHorizontal: 16 },
  disabled: { opacity: 0.5 },
  optionText: { color: c.foreground, fontSize: 14, fontWeight: "700" },
  destructive: { color: c.deleteText },
  cancel: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { color: c.labelText, fontSize: 13, fontWeight: "700" },
});
