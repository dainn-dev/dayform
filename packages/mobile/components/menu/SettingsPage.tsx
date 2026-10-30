import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import { useKeyboardInset } from "../../hooks/use-keyboard-inset";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import type { MenuRow } from "../../lib/settings-menu";
import { PersonalCard } from "../personal/PersonalCard";
import { SETTINGS_PAGES } from "../personal/sections";
import { PageHeader } from "./PageHeader";

const CONTENT_PADDING_BOTTOM = 40;

/** One settings page: header with back button, then the section body in a card. Rendered by app/settings/[section].tsx. */
export function SettingsPage({ row }: { row: MenuRow }) {
  const { t } = useLanguage();
  const colors = useColors();
  const { saveError } = useSettings();
  const keyboard = useKeyboardInset();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { Component, hasTextInput } = SETTINGS_PAGES[row.slug];
  // Pages with a text field keep the field reachable above the keyboard.
  const bottom = CONTENT_PADDING_BOTTOM + (hasTextInput ? keyboard.height : 0);

  return <SafeAreaView edges={["top", "left", "right", "bottom"]} style={s.root}>
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottom }]} showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <PageHeader title={t(row.title)} />
      {saveError && <View accessibilityRole="alert" style={s.error}>
        <Text style={{ color: colors.errorMessage }}>{t("Could not save your settings. They will reset when you reopen the app.")}</Text>
      </View>}
      <PersonalCard><Component /></PersonalCard>
    </ScrollView>
  </SafeAreaView>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: 22, paddingTop: 20 },
  error: { padding: 13, backgroundColor: c.errorBg, borderRadius: 12, marginBottom: 12 },
});
