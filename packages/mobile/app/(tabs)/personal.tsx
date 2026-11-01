import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { PersonalMenu } from "../../components/menu/PersonalMenu";
import { ProfileCard } from "../../components/personal/ProfileCard";

/** The Personal tab: the profile header and a menu of settings groups. Every group opens its own page (app/settings). */
export default function PersonalScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const { saveError } = useSettings();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return <SafeAreaView edges={["top", "left", "right"]} style={s.root}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text accessibilityRole="header" style={s.kicker}>{t("YOUR SPACE")}</Text>
      <Text accessibilityRole="header" style={s.title}>{t("You")}<Text style={{ color: colors.titleDot }}>.</Text></Text>
      {saveError && <View accessibilityRole="alert" style={s.error}>
        <Text style={{ color: colors.errorMessage }}>{t("Could not save your settings. They will reset when you reopen the app.")}</Text>
      </View>}
      <View style={s.profile}>
        <ProfileCard />
      </View>
      <PersonalMenu />
    </ScrollView>
  </SafeAreaView>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: 22, paddingTop: 28, paddingBottom: 40 },
  kicker: { color: c.primary, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 10 },
  title: { color: c.foreground, fontSize: 31, fontWeight: "800", letterSpacing: -1 },
  error: { padding: 13, backgroundColor: c.errorBg, borderRadius: 12, marginTop: 15 },
  profile: { marginTop: 20 },
});
