import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { NameInput } from "../onboarding/NameInput";
import { useLanguage } from "../../lib/language";
import { isValidName, nameInitial } from "../../lib/settings";
import { useSettings } from "../../lib/settings-context";

const AVATAR_SIZE = 56;
const MIN_TOUCH_TARGET = 44;

/** Avatar, name and an inline editor (same validation as the first-launch prompt). */
export function ProfileCard() {
  const { settings, setName } = useSettings();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const name = settings.profile.name;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const canSave = isValidName(draft) && !busy;

  const startEditing = () => { setDraft(name); setEditing(true); };
  const stopEditing = () => setEditing(false);
  const save = useCallback(async () => {
    if (!canSave) return;
    setBusy(true);
    await setName(draft);
    setBusy(false);
    setEditing(false);
  }, [canSave, draft, setName]);

  return <View style={s.card}>
    <View style={s.row}>
      <View style={s.avatar} accessible={false} importantForAccessibility="no-hide-descendants">
        <Text style={s.initial}>{nameInitial(name)}</Text>
      </View>
      <Text style={s.name} numberOfLines={2}>{name || t("Add your name")}</Text>
      {!editing && <Pressable onPress={startEditing} accessibilityRole="button" accessibilityLabel={t("Edit your name")} style={s.editButton}>
        <Text style={s.editText}>{t("Edit")}</Text>
      </Pressable>}
    </View>
    {editing && <View style={s.editor}>
      <NameInput value={draft} onChange={setDraft} onSubmit={() => { void save(); }} focusAfterMs={0} />
      <View style={s.actions}>
        <Pressable onPress={stopEditing} accessibilityRole="button" style={s.cancel}><Text style={s.cancelText}>{t("Cancel")}</Text></Pressable>
        <Pressable onPress={() => { void save(); }} disabled={!canSave} accessibilityRole="button"
          accessibilityState={{ disabled: !canSave, busy }} style={[s.save, !canSave && s.disabled]}>
          <Text style={s.saveText}>{t("Save")}</Text>
        </Pressable>
      </View>
    </View>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 17, padding: 16, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
  initial: { color: c.accentForeground, fontSize: 24, fontWeight: "800" },
  name: { flex: 1, color: c.foreground, fontSize: 19, fontWeight: "800" },
  editButton: { minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, paddingHorizontal: 14, borderRadius: 13, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
  editText: { color: c.accentForeground, fontSize: 13, fontWeight: "800" },
  editor: { marginTop: 16 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  cancel: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 18, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cancelText: { color: c.mutedForeground, fontSize: 13, fontWeight: "700" },
  save: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 22, borderRadius: 13, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.45 },
  saveText: { color: c.onPrimary, fontSize: 13, fontWeight: "800" },
});
