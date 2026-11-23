import React, { Component, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, useColorScheme, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/palettes";
import { formatErrorDetails } from "@/lib/error-report";
import { vi } from "@/lib/i18n/errors";

// Same key as lib/language.tsx. The boundary sits outside LanguageProvider, so it reads the choice itself.
const LANGUAGE_KEY = "dayform.language.v1";
const MIN_TOUCH_TARGET = 44;
const SCREEN_PADDING = 24;
const ICON_WRAP = 72;

/** The saved UI language, or English until (or unless) it can be read. */
function useStoredLanguage(): "en" | "vi" {
  const [language, setLanguage] = useState<"en" | "vi">("en");
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then(value => { if (active && value === "vi") setLanguage("vi"); })
      .catch(() => { /* Storage unreadable: English is the safe default on a crash screen. */ });
    return () => { active = false; };
  }, []);
  return language;
}

type FallbackProps = { error: unknown; onReset: () => void };

/**
 * The crash screen sits outside every provider (settings, theme, fonts), so it must not read the design theme: it uses
 * the original Dayform palette for the system's light/dark scheme and the system font, which always work.
 */
function ErrorFallback({ error, onReset }: FallbackProps) {
  const colors = Colors[useColorScheme() === "dark" ? "dark" : "light"];
  const language = useStoredLanguage();
  const [showDetails, setShowDetails] = useState(false);
  const t = (text: string) => (language === "vi" ? vi[text] ?? text : text);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: (StatusBar.currentHeight ?? 0) + SCREEN_PADDING }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.errorBg }]}>
        <Ionicons name="alert-circle-outline" size={36} color={colors.errorIcon} />
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{t("Something went wrong")}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        {t("Dayform hit an unexpected error. Your tasks are safe on this device.")}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Try again")}
        onPress={onReset}
        style={[styles.primaryButton, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{t("Try again")}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
        onPress={() => setShowDetails(open => !open)}
        style={styles.linkButton}
      >
        <Text style={[styles.linkText, { color: colors.accentForeground }]}>{t(showDetails ? "Hide details" : "Show details")}</Text>
      </Pressable>
      {showDetails && (
        <View style={[styles.details, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t("Press and hold the text below to select and copy it.")}</Text>
          <ScrollView>
            <Text selectable style={[styles.detailsText, { color: colors.foreground }]}>{formatErrorDetails(error)}</Text>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

type Props = { children: ReactNode };
type State = { failed: boolean; error: unknown };

/** Catches render errors anywhere below it and shows a recoverable screen instead of a blank app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, error };
  }

  private reset = () => {
    this.setState({ failed: false, error: null });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return <ErrorFallback error={this.state.error} onReset={this.reset} />;
  }
}

// Fixed sizes on purpose: this screen cannot use the theme's text roles (see ErrorFallback).
const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", paddingHorizontal: SCREEN_PADDING, paddingBottom: SCREEN_PADDING },
  iconWrap: { width: ICON_WRAP, height: ICON_WRAP, borderRadius: ICON_WRAP / 2, alignItems: "center", justifyContent: "center", marginTop: 48 },
  title: { fontSize: 24, fontWeight: "700", marginTop: 20, textAlign: "center" },
  body: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: "center" },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 160,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    marginTop: 28,
  },
  primaryText: { fontSize: 16, fontWeight: "700" },
  linkButton: { minHeight: MIN_TOUCH_TARGET, justifyContent: "center", marginTop: 8 },
  linkText: { fontSize: 14, fontWeight: "600" },
  details: { alignSelf: "stretch", flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 4 },
  hint: { fontSize: 12, marginBottom: 8 },
  detailsText: { fontSize: 12, lineHeight: 17, fontFamily: "monospace" },
});
