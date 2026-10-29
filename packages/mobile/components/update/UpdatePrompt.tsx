import React, { useMemo, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import type { Release } from "../../lib/update-check";
import { fillPlaceholders } from "../../lib/text-template";
import { useUpdates, type UpdatesValue } from "../../lib/update-context";

const BYTES_PER_MB = 1024 * 1024;

type Styles = ReturnType<typeof makeStyles>;
type CardProps = {
  release: Release;
  currentVersion: string;
  dismiss: UpdatesValue["dismiss"];
  skip: UpdatesValue["skip"];
  s: Styles;
};

/** "New version available" dialog. Update opens the GitHub download link; the system installer does the rest. */
export function UpdatePrompt() {
  const { promptOpen, release, currentVersion, dismiss, skip } = useUpdates();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  if (!release) return null;

  return <Modal visible={promptOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={dismiss}>
    <View style={s.center}>
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={dismiss} accessible={false} importantForAccessibility="no" />
      {/* The key gives every opening of the dialog a fresh card, so no error notice survives a re-open. */}
      <PromptCard key={`${release.version}:${promptOpen}`} release={release} currentVersion={currentVersion} dismiss={dismiss} skip={skip} s={s} />
    </View>
  </Modal>;
}

function PromptCard({ release, currentVersion, dismiss, skip, s }: CardProps) {
  const { t } = useLanguage();
  const [linkFailed, setLinkFailed] = useState(false);
  const [skipFailed, setSkipFailed] = useState(false);
  const message = fillPlaceholders(t("Version {version} is ready. You have {current}."), { version: release.version, current: currentVersion });
  const size = release.apkBytes
    ? fillPlaceholders(t("Download size: {size} MB"), { size: (release.apkBytes / BYTES_PER_MB).toFixed(1) })
    : null;

  const openLink = () => {
    Linking.openURL(release.apkUrl ?? release.pageUrl).then(dismiss, () => setLinkFailed(true));
  };
  const skipVersion = () => {
    void skip().then(result => { if (!result.ok) setSkipFailed(true); });
  };

  return <View style={s.card} accessibilityViewIsModal>
    <Text style={s.title} accessibilityRole="header">{t("New version available")}</Text>
    <Text style={s.message}>{message}</Text>
    {size !== null && <Text style={s.message}>{size}</Text>}
    {release.notes !== "" && <ScrollView style={s.notesBox} contentContainerStyle={s.notesContent} accessibilityLabel={t("Release notes")}>
      <Text style={s.notes}>{release.notes}</Text>
    </ScrollView>}
    {linkFailed && <Text accessibilityRole="alert" style={s.error}>{t("Could not open the link.")}</Text>}
    {skipFailed && <Text accessibilityRole="alert" style={s.error}>{t("Could not save your choice.")}</Text>}
    <Pressable onPress={openLink} accessibilityRole="button" style={s.primary}>
      <Text style={s.primaryText}>{t("Update")}</Text>
    </Pressable>
    <Pressable onPress={dismiss} accessibilityRole="button" style={s.secondary}>
      <Text style={s.secondaryText}>{t("Later")}</Text>
    </Pressable>
    <Pressable onPress={skipVersion} accessibilityRole="button" style={s.tertiary}>
      <Text style={s.tertiaryText}>{t("Skip this version")}</Text>
    </Pressable>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  scrim: { backgroundColor: c.scrim },
  card: { backgroundColor: c.card, borderRadius: 22, padding: 22, gap: 10 },
  title: { color: c.foreground, fontSize: 18, fontWeight: "800" },
  message: { color: c.labelText, fontSize: 13, marginBottom: 2 },
  notesBox: { maxHeight: 180, borderRadius: 14, backgroundColor: c.background, borderWidth: 1, borderColor: c.inputBorder },
  notesContent: { padding: 12 },
  notes: { color: c.foreground, fontSize: 12, lineHeight: 18 },
  error: { color: c.errorMessage, fontSize: 12, fontWeight: "700" },
  primary: { minHeight: 48, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryText: { color: c.onPrimary, fontSize: 14, fontWeight: "800" },
  secondary: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: c.inputBorder, backgroundColor: c.background, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  secondaryText: { color: c.foreground, fontSize: 14, fontWeight: "700" },
  tertiary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  tertiaryText: { color: c.labelText, fontSize: 13, fontWeight: "700" },
});
