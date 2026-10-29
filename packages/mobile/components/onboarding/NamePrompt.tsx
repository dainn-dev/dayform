import React, { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { isValidName } from "../../lib/settings";
import { useSettings } from "../../lib/settings-context";
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
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
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
          <Pressable onPress={() => { void submit(); }} disabled={!canContinue} accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue, busy }} style={[s.button, !canContinue && s.buttonDisabled]}>
            <Text style={s.buttonText}>{t("Continue")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  scrim: { backgroundColor: c.scrim },
  center: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24 },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", backgroundColor: c.card, borderRadius: 22, padding: 22, gap: 10 },
  title: { color: c.foreground, fontSize: 20, fontWeight: "800", marginBottom: 6 },
  helper: { color: c.labelText, fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: c.primary, minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: c.onPrimary, fontSize: 14, fontWeight: "800" },
});
