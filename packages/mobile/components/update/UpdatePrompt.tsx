import React, { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { Button } from "../ui/Button";
import { Surface } from "../ui/Surface";
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
  const s = useThemedStyles(makeStyles);
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

  return <Surface level="overlay" padding="xl" style={s.card} accessibilityViewIsModal>
    <Text style={s.title} accessibilityRole="header">{t("New version available")}</Text>
    <Text style={s.message}>{message}</Text>
    {size !== null && <Text style={s.message}>{size}</Text>}
    {release.notes !== "" && <ScrollView style={s.notesBox} contentContainerStyle={s.notesContent} accessibilityLabel={t("Release notes")}>
      <Text style={s.notes}>{release.notes}</Text>
    </ScrollView>}
    {linkFailed && <Text accessibilityRole="alert" style={s.error}>{t("Could not open the link.")}</Text>}
    {skipFailed && <Text accessibilityRole="alert" style={s.error}>{t("Could not save your choice.")}</Text>}
    <Button label={t("Update")} onPress={openLink} block />
    <Button label={t("Later")} variant="secondary" onPress={dismiss} block />
    <Button label={t("Skip this version")} variant="ghost" onPress={skipVersion} block />
  </Surface>;
}

const makeStyles = ({ colors: c, type, font, radius, space, gutter }: Theme) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: gutter },
  scrim: { backgroundColor: c.scrim },
  card: { gap: 10 },
  title: { ...type.title, color: c.foreground },
  message: { ...type.body, color: c.labelText, marginBottom: space.xxs },
  notesBox: { maxHeight: 180, borderRadius: radius.md, backgroundColor: c.background, borderWidth: 1, borderColor: c.inputBorder },
  notesContent: { padding: space.md },
  notes: { ...type.meta, ...font.regular, color: c.foreground },
  error: { ...type.meta, ...font.bold, color: c.errorMessage },
});
