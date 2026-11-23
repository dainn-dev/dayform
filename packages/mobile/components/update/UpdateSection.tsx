import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { fillPlaceholders } from "../../lib/text-template";
import { currentUpdateLabel, describeCurrent } from "../../lib/ota";
import { useOta } from "../../lib/ota-context";
import { useSettings } from "../../lib/settings-context";
import { useUpdates } from "../../lib/update-context";
import { summarizeUpdates, updateSummaryLine } from "../../lib/update-summary";

/** Speaks a changed status line once. The value present at mount is not announced (it is old news). */
function useAnnounceChanges(text: string | null): void {
  const previous = useRef(text);
  useEffect(() => {
    if (text === previous.current) return;
    previous.current = text;
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}

/**
 * Settings block "Updates". One switch and one button cover both channels: a new APK (asks before installing) and new
 * app content (downloads quietly, applies the next time the app starts). Only one status line is shown.
 */
export function UpdateSection() {
  const apk = useUpdates();
  const ota = useOta();
  const { settings, update } = useSettings();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);

  const kind = summarizeUpdates(apk, ota);
  const line = updateSummaryLine(apk, ota, t);
  useAnnounceChanges(line);

  const busy = kind === "checking";
  const auto = apk.auto && settings.updates.autoOta;
  const setAuto = (next: boolean) => {
    void apk.setAuto(next);
    void update({ updates: { autoOta: next } });
  };
  const check = () => { void Promise.allSettled([apk.checkNow(), ota.checkNow()]); };
  const lineStyle = kind === "error" ? s.error : kind === "up-to-date" || kind === "content-ready" ? s.success : s.muted;

  return <View>
    <Text style={s.version}>{fillPlaceholders(t("Dayform {version}"), { version: apk.currentVersion })}</Text>
    {ota.status !== "unsupported" && <Text style={s.version}>{currentUpdateLabel(describeCurrent(ota.current), t)}</Text>}
    <View style={s.switchRow}>
      {/* The switch carries the label for TalkBack; the visible text beside it is not a second focus stop. */}
      <Text style={s.switchLabel} accessible={false} importantForAccessibility="no">{t("Check automatically")}</Text>
      <Switch value={auto} onValueChange={setAuto} accessibilityLabel={t("Check automatically")}
        trackColor={{ false: colors.track, true: colors.primary }} thumbColor={colors.onPrimary} />
    </View>
    <Pressable disabled={busy} onPress={check} accessibilityRole="button" accessibilityLabel={t("Check for updates")}
      accessibilityState={{ disabled: busy, busy }} style={[s.button, busy && s.disabled]}>
      {busy ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="refresh-outline" size={18} color={colors.primary} />}
      <Text style={s.buttonText}>{t("Check for updates")}</Text>
    </Pressable>
    {kind === "apk-available" ? <Pressable onPress={apk.openPrompt} accessibilityRole="button" style={s.availableRow}>
      <Text style={s.available}>{line}</Text>
    </Pressable> : line ? <Text style={lineStyle}>{line}</Text> : null}
  </View>;
}

const makeStyles = ({ colors: c, type, font, radius, space }: Theme) => StyleSheet.create({
  version: { ...type.meta, ...font.regular, color: c.mutedForeground },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, minHeight: 44, marginTop: space.xs },
  switchLabel: { ...type.label, flex: 1, color: c.foreground },
  // Drawn by hand (not the kit's Button), so the words stay beside the spinner while it checks and the button keeps its width.
  button: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: space.sm, minHeight: 44, paddingHorizontal: 14, marginTop: space.xs,
    borderRadius: radius.md, backgroundColor: c.primaryTint,
  },
  buttonText: { ...type.meta, ...font.heavy, color: c.foreground },
  disabled: { opacity: 0.45 },
  muted: { ...type.meta, ...font.regular, color: c.mutedForeground, marginTop: space.sm },
  success: { ...type.meta, ...font.bold, color: c.success, marginTop: space.sm },
  error: { ...type.meta, ...font.bold, color: c.errorMessage, marginTop: space.sm },
  availableRow: { minHeight: 44, justifyContent: "center", marginTop: space.xxs },
  available: { ...type.meta, ...font.heavy, color: c.countText },
});
