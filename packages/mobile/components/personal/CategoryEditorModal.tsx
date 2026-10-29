import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useCategoryColors, type CategoryColors, type IconName } from "../../hooks/use-category-colors";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import {
  DEFAULT_COLOR_SLOT, DEFAULT_ICON, MAX_NAME_LENGTH, addCategory, renameBuiltin, updateCategory,
  type CategoriesState, type CategoryResult, type ColorSlot, type IconKey,
} from "../../lib/categories";
import { useCategories } from "../../lib/categories-context";
import { failureMessage } from "../../lib/category-labels";
import { useLanguage } from "../../lib/language";
import { fillPlaceholders } from "../../lib/text-template";
import { CategoryBadge } from "./CategoryBadge";
import { ColorPicker, IconPicker } from "./CategoryPickers";

export type EditorTarget = { kind: "new" } | { kind: "edit"; id: string };

type Props = { target: EditorTarget | null; onClose: () => void };

/**
 * Transparent dialog to add a custom category or edit one. Built-in categories only get their display name changed
 * (with "Reset to default"). Dismissable by Cancel, the backdrop or Android back. The title and the Save/Cancel
 * footer stay outside the ScrollView, inside a KeyboardAvoidingView, so Save stays visible with the keyboard open.
 */
export function CategoryEditorModal({ target, onClose }: Props) {
  return <Modal visible={target !== null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    {target !== null && <EditorBody key={target.kind === "new" ? "new" : target.id} target={target} onClose={onClose} />}
  </Modal>;
}

function EditorBody({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const cats = useCategories();
  const { t } = useLanguage();
  const colors = useColors();
  const lookup = useCategoryColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const id = target.kind === "edit" ? target.id : null;
  const resolved = id === null ? null : cats.resolve(id);
  const builtin = resolved?.builtin === true;
  const existing = id === null ? undefined : cats.state.custom.find(item => item.id === id);
  const [name, setName] = useState(() => (id === null ? "" : cats.label(id)));
  const [color, setColor] = useState<ColorSlot>(existing?.color ?? DEFAULT_COLOR_SLOT);
  const [icon, setIcon] = useState<IconKey>(existing?.icon ?? DEFAULT_ICON);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const check = checkDraft(cats.state, target, { name, color, icon }, t);
  const blocked = cats.locked || busy;
  const canSave = check.ok && !blocked;
  const reason = failure ?? (!check.ok && (touched || name !== "") ? check.reason : null);
  const canReset = builtin && id !== null && Object.hasOwn(cats.state.renamed, id);

  const run = async (action: () => ReturnType<typeof cats.add>) => {
    setBusy(true);
    setFailure(null);
    const result = await action();
    setBusy(false);
    if (result.ok) onClose(); else setFailure(result.reason);
  };
  const save = () => {
    setTouched(true);
    if (!canSave) return;
    if (id === null) void run(() => cats.add({ name, color, icon }));
    else if (builtin) void run(() => cats.rename(id, name));
    else void run(() => cats.update(id, { name, color, icon }));
  };
  const reset = () => { if (id !== null && !blocked) void run(() => cats.rename(id, "")); };

  const previewColors: CategoryColors = id !== null && builtin
    ? lookup.get(id)
    : { ...colors.category[color], icon: icon as IconName };
  const typed = name.trim();
  const previewName = typed !== "" ? typed : id !== null ? cats.label(id) : t("New category");
  const message = reason === null ? null : failureMessage(reason);
  const title = id === null ? t("New category") : t("Edit category");

  return <KeyboardAvoidingView style={s.flex} behavior="padding">
    <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onClose} accessible={false} importantForAccessibility="no" />
    <View style={s.center} pointerEvents="box-none">
      <View style={s.card} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={s.title}>{title}</Text>
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={s.caption}>{t("Category name")}</Text>
          <TextInput value={name} onChangeText={next => { setName(next); setFailure(null); }} onBlur={() => setTouched(true)}
            onSubmitEditing={save} editable={!blocked} placeholder={t("Category name")} placeholderTextColor={colors.placeholder}
            maxLength={MAX_NAME_LENGTH} autoCorrect={false} returnKeyType="done" accessibilityLabel={t("Category name")}
            style={s.input} />
          {message !== null && <Text accessibilityRole="alert" style={s.error}>{fillPlaceholders(t(message.key), message.values ?? {})}</Text>}
          <Text style={s.caption}>{t("Preview")}</Text>
          <View style={s.preview} accessible accessibilityLabel={previewName}>
            <CategoryBadge colors={previewColors} />
            <Text style={s.previewName} numberOfLines={1}>{previewName}</Text>
          </View>
          {builtin
            ? <>
              <Text style={s.helper}>{t("Built-in categories keep their color and icon. You can only change the name.")}</Text>
              {canReset && <Pressable onPress={reset} disabled={blocked} accessibilityRole="button" style={s.reset}>
                <Text style={s.resetText}>{t("Reset to default")}</Text>
              </Pressable>}
            </>
            : <>
              <Text style={s.caption}>{t("Color")}</Text>
              <ColorPicker value={color} onChange={setColor} disabled={blocked} />
              <Text style={s.caption}>{t("Icon")}</Text>
              <IconPicker value={icon} onChange={setIcon} slot={color} disabled={blocked} />
            </>}
        </ScrollView>
        <View style={s.actions}>
          <View style={s.flex} />
          <Pressable onPress={onClose} accessibilityRole="button" style={s.ghost}><Text style={s.ghostText}>{t("Cancel")}</Text></Pressable>
          <Pressable onPress={save} disabled={!canSave} accessibilityRole="button" accessibilityState={{ disabled: !canSave, busy }}
            style={[s.save, !canSave && s.disabled]}>
            <Text style={s.saveText}>{t("Save")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </KeyboardAvoidingView>;
}

type Draft = { name: string; color: ColorSlot; icon: IconKey };
type Check = { ok: true } | { ok: false; reason: string };

/** Runs the real pure operation on the current state, so the live message and Save always agree with what saving does. */
function checkDraft(state: CategoriesState, target: EditorTarget, draft: Draft, translate: (text: string) => string): Check {
  let result: CategoryResult;
  if (target.kind === "new") result = addCategory(state, draft, { translate });
  else if (state.custom.some(item => item.id === target.id)) result = updateCategory(state, target.id, draft, { translate });
  else result = renameBuiltin(state, target.id, draft.name, { translate });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  scrim: { backgroundColor: c.scrim },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24 },
  card: { width: "100%", maxWidth: 440, maxHeight: "100%", alignSelf: "center", backgroundColor: c.card, borderRadius: 22, padding: 20, flexShrink: 1 },
  title: { color: c.foreground, fontSize: 19, fontWeight: "800", marginBottom: 2 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  caption: { color: c.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  input: { minHeight: 52, backgroundColor: c.background, borderRadius: 15, paddingHorizontal: 16, paddingVertical: 14, color: c.foreground, fontSize: 16, borderWidth: 1, borderColor: c.inputBorder },
  error: { color: c.errorMessage, fontSize: 12, lineHeight: 17, marginTop: 8 },
  helper: { color: c.labelText, fontSize: 12, lineHeight: 18, marginTop: 16 },
  preview: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  previewName: { flex: 1, color: c.foreground, fontSize: 15, fontWeight: "700" },
  reset: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 14, marginTop: 8, borderRadius: 13, backgroundColor: c.primaryTint },
  resetText: { color: c.accentForeground, fontSize: 13, fontWeight: "800" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  ghost: { minHeight: 44, paddingHorizontal: 14, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  ghostText: { color: c.mutedForeground, fontSize: 13, fontWeight: "700" },
  save: { minHeight: 44, paddingHorizontal: 22, borderRadius: 13, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  saveText: { color: c.onPrimary, fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.45 },
});
