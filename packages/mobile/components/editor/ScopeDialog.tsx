import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import type { EditScope } from "../../lib/recurrence";
import { Button } from "../ui/Button";
import { Surface } from "../ui/Surface";

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
  const s = useThemedStyles(makeStyles);
  const isDelete = mode === "delete";
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
    <View style={s.center}>
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onCancel} accessible={false} importantForAccessibility="no" />
      <Surface level="overlay" padding="xl" style={s.card} accessibilityViewIsModal>
        <Text style={s.title} accessibilityRole="header">{t(isDelete ? "Delete repeating task" : "Edit repeating task")}</Text>
        <Text style={s.message}>{t("Which tasks should this change apply to?")}</Text>
        {SCOPE_ORDER.filter(scope => scopes.includes(scope)).map(scope => <Pressable key={scope} onPress={() => onChoose(scope)} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[s.option, disabled && s.disabled]}>
          <Text style={[s.optionText, isDelete && s.destructive]}>{t(SCOPE_LABELS[scope])}</Text>
        </Pressable>)}
        <Button label={t("Cancel")} variant="ghost" disabled={disabled} onPress={onCancel} block />
      </Surface>
    </View>
  </Modal>;
}

const makeStyles = ({ colors: c, radius, space, type, font, gutter }: Theme) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: gutter },
  scrim: { backgroundColor: c.scrim },
  card: { gap: 10 },
  title: { ...type.title, color: c.foreground },
  message: { ...type.body, color: c.labelText, marginBottom: 6 },
  option: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.inputBorder, backgroundColor: c.background, justifyContent: "center", paddingHorizontal: space.lg },
  disabled: { opacity: 0.5 },
  optionText: { ...type.body, ...font.bold, color: c.foreground },
  destructive: { color: c.deleteText },
});
