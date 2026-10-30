import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { currentUpdateLabel, describeCurrent } from "../../lib/ota";
import { useOta } from "../../lib/ota-context";
import { fillPlaceholders } from "../../lib/text-template";
import { useUpdates } from "../../lib/update-context";

/** Body of the About page: the installed version, the running content and where the data lives. */
export function AboutSection() {
  const { t } = useLanguage();
  const colors = useColors();
  const { currentVersion } = useUpdates();
  const ota = useOta();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.stack}>
    <Text style={s.version}>{fillPlaceholders(t("Dayform {version}"), { version: currentVersion })}</Text>
    {ota.status !== "unsupported" && <Text style={s.meta}>{currentUpdateLabel(describeCurrent(ota.current), t)}</Text>}
    <Text style={s.privacy}>{t("Your data stays on this device")}</Text>
    <Text style={s.meta}>{t("Your tasks, categories and settings are stored only on this device. The only network requests check for app updates, and they carry no task data.")}</Text>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  stack: { gap: 6 },
  version: { color: c.foreground, fontSize: 17, fontWeight: "800" },
  privacy: { color: c.foreground, fontSize: 14, fontWeight: "700", marginTop: 4 },
  meta: { color: c.mutedForeground, fontSize: 13, lineHeight: 19 },
});
