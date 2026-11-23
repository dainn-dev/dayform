import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { currentUpdateLabel, describeCurrent } from "../../lib/ota";
import { useOta } from "../../lib/ota-context";
import { fillPlaceholders } from "../../lib/text-template";
import { useUpdates } from "../../lib/update-context";

/** A hidden way in: a long press on the version line (or TalkBack's "long press" action) opens the design gallery. */
const openGallery = () => router.push("/design-gallery" as never);

/** Body of the About page: the installed version, the running content and where the data lives. */
export function AboutSection() {
  const { t } = useLanguage();
  const { currentVersion } = useUpdates();
  const ota = useOta();
  const s = useThemedStyles(makeStyles);
  return <View style={s.stack}>
    <Text style={s.version} onLongPress={openGallery}
      accessibilityActions={[{ name: "longpress", label: t("Open the design gallery") }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === "longpress") openGallery(); }}>
      {fillPlaceholders(t("Dayform {version}"), { version: currentVersion })}
    </Text>
    {ota.status !== "unsupported" && <Text style={s.meta}>{currentUpdateLabel(describeCurrent(ota.current), t)}</Text>}
    <Text style={s.privacy}>{t("Your data stays with you")}</Text>
    <Text style={s.meta}>{t("Your tasks, categories and settings are stored on this device. If your phone's backup is on, Android also keeps an encrypted copy in your own Google account (turn it off in your phone's Backup settings). The only network requests Dayform makes check for app updates, and they carry no task data.")}</Text>
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  stack: { gap: t.space.xs + 2 },
  version: { ...t.type.title, color: t.colors.foreground },
  privacy: { ...t.type.body, ...t.font.bold, color: t.colors.foreground, marginTop: t.space.xs },
  meta: { ...t.type.body, color: t.colors.mutedForeground },
});
