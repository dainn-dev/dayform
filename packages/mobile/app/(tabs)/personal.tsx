import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { PersonalMenu } from "../../components/menu/PersonalMenu";
import { ProfileCard } from "../../components/personal/ProfileCard";
import { Title } from "../../components/ui/Title";

/** The Personal tab: the profile header and a menu of settings groups. Every group opens its own page (app/settings). */
export default function PersonalScreen() {
  const { t } = useLanguage();
  const { saveError } = useSettings();
  const s = useThemedStyles(makeStyles);

  return <SafeAreaView edges={["top", "left", "right"]} style={s.root}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text accessibilityRole="header" style={s.kicker}>{t("YOUR SPACE")}</Text>
      <Title>{t("You")}</Title>
      {saveError && <View accessibilityRole="alert" style={s.error}>
        <Text style={s.errorText}>{t("Could not save your settings. They will reset when you reopen the app.")}</Text>
      </View>}
      <View style={s.profile}>
        <ProfileCard />
      </View>
      <PersonalMenu />
    </ScrollView>
  </SafeAreaView>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: t.gutter, paddingTop: 28, paddingBottom: 40 },
    kicker: { ...t.type.micro, color: c.primary, marginBottom: 10 },
    error: { padding: 13, backgroundColor: c.errorBg, borderRadius: t.radius.md, marginTop: 15 },
    errorText: { ...t.type.body, color: c.errorMessage },
    profile: { marginTop: t.space.xl },
  });
};
