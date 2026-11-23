import React, { useCallback, useState } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { isValidName } from "../../lib/settings";
import { useSettings } from "../../lib/settings-context";
import { Button } from "../ui/Button";
import { NameInput } from "./NameInput";

const FOCUS_DELAY_MS = 350;

/** Android back must not dismiss the dialog: the app needs a name before it greets the user. */
function ignoreBack(): void {}

/**
 * Blocking first-launch dialog: a centered card over a dimmed backdrop. Shown only once the stored settings
 * were read and no name is set. There is no skip; the backdrop and Android back do nothing. Mount it inside
 * SettingsProvider, LanguageProvider and ThemeProvider.
 *
 * The card sits in a KeyboardAvoidingView (padding on both platforms: it measures the real overlap, so it also
 * works when the window already resizes) inside a ScrollView, so on a short window it scrolls instead of being cropped.
 */
export function NamePrompt() {
  const { ready, hasName, setName } = useSettings();
  const { t } = useLanguage();
  const s = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const canContinue = isValidName(draft) && !busy;

  const submit = useCallback(async () => {
    if (!canContinue) return;
    setBusy(true);
    await setName(draft);
    setBusy(false);
  }, [canContinue, draft, setName]);

  return <Modal visible={ready && !hasName} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={ignoreBack}>
    <KeyboardAvoidingView style={s.flex} behavior="padding">
      <View style={[StyleSheet.absoluteFill, s.scrim]} accessible={false} importantForAccessibility="no" />
      <ScrollView style={s.flex} contentContainerStyle={s.center} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.card} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={s.title}>{t("What's your name?")}</Text>
          <NameInput value={draft} onChange={setDraft} onSubmit={() => { void submit(); }} focusAfterMs={FOCUS_DELAY_MS} />
          <Text style={s.helper}>{t("Your name stays on this device.")}</Text>
          <Button block label={t("Continue")} disabled={!canContinue} busy={busy} onPress={() => { void submit(); }} style={s.button} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    flex: { flex: 1 },
    scrim: { backgroundColor: c.scrim },
    center: { flexGrow: 1, justifyContent: "center", paddingHorizontal: t.space.xxl, paddingVertical: t.space.xxl },
    card: { width: "100%", maxWidth: 420, alignSelf: "center", backgroundColor: c.card, borderRadius: t.radius.xl, padding: 22, gap: 10, ...t.elevation.overlay },
    title: { ...t.type.headline, color: c.foreground, marginBottom: t.space.xs + 2 },
    helper: { ...t.type.meta, ...t.font.regular, color: c.labelText },
    button: { marginTop: t.space.sm },
  });
};
