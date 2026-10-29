import React, { useEffect, useMemo, useRef } from "react";
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { fillPlaceholders } from "../../lib/text-template";
import { currentUpdateLabel, describeCurrent, otaStatusLine } from "../../lib/ota";
import { useOta } from "../../lib/ota-context";
import { useSettings } from "../../lib/settings-context";
import { useUpdates, type UpdatesValue } from "../../lib/update-context";
import { SwitchRow } from "../personal/SwitchRow";

/** Text of the status line for the current state (already translated), or null when there is nothing to say. */
function statusLine(
  value: Pick<UpdatesValue, "status" | "release" | "errorReason">,
  t: (text: string) => string,
): string | null {
  switch (value.status) {
    case "checking": return t("Checking...");
    case "up-to-date": return t("You have the latest version");
    case "error": return t(value.errorReason === "rate-limited"
      ? "Too many requests. Try again later."
      : "Could not check for updates. Check your connection.");
    case "available": return value.release ? fillPlaceholders(t("Version {version} is available"), { version: value.release.version }) : null;
    default: return null;
  }
}

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
 * "App content" block: over-the-air updates of the app's JavaScript. Quiet by design: no dialog, no reload. New content
 * downloads in the background and applies the next time the app starts.
 */
function OtaBlock() {
  const { status, errorKind, current, checkNow } = useOta();
  const { settings, update } = useSettings();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const line = otaStatusLine({ status, errorKind }, t);
  useAnnounceChanges(line);
  const unsupported = status === "unsupported";
  const busy = status === "checking" || status === "downloading";
  const blocked = busy || status === "ready" || unsupported;
  const lineStyle = status === "error" ? s.error : status === "upToDate" || status === "ready" ? s.success : s.muted;

  return <View style={s.otaBlock}>
    <Text style={s.otaTitle} accessibilityRole="header">{t("App content")}</Text>
    <Text style={s.version}>{currentUpdateLabel(describeCurrent(current), t)}</Text>
    <SwitchRow label={t("Update app content automatically")}
      hint={t("Checks the Dayform update server for new content. No task data is sent.")}
      value={settings.updates.autoOta} onChange={next => { void update({ updates: { autoOta: next } }); }} />
    <Pressable disabled={blocked} onPress={() => { void checkNow(); }} accessibilityRole="button"
      accessibilityLabel={t("Check now")} accessibilityState={{ disabled: blocked, busy }} style={[s.button, blocked && s.disabled]}>
      {busy ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />}
      <Text style={s.buttonText}>{t("Check now")}</Text>
    </Pressable>
    {line ? <Text style={lineStyle}>{line}</Text> : null}
  </View>;
}

/** Settings block "Updates": installed version, automatic-check switch and a manual check with live status. */
export function UpdateSection() {
  const { status, release, errorReason, auto, currentVersion, checkNow, setAuto, openPrompt } = useUpdates();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const checking = status === "checking";
  const line = statusLine({ status, release, errorReason }, t);
  useAnnounceChanges(line);

  return <View>
    <Text style={s.version}>{fillPlaceholders(t("Dayform {version}"), { version: currentVersion })}</Text>
    <View style={s.switchRow}>
      {/* The switch carries the label for TalkBack; the visible text beside it is not a second focus stop. */}
      <Text style={s.switchLabel} accessible={false} importantForAccessibility="no">{t("Check automatically")}</Text>
      <Switch value={auto} onValueChange={next => { void setAuto(next); }} accessibilityLabel={t("Check automatically")}
        trackColor={{ false: colors.track, true: colors.primary }} thumbColor={colors.onPrimary} />
    </View>
    <Pressable disabled={checking} onPress={() => { void checkNow(); }} accessibilityRole="button" accessibilityState={{ disabled: checking, busy: checking }} style={[s.button, checking && s.disabled]}>
      {checking ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="refresh-outline" size={18} color={colors.primary} />}
      <Text style={s.buttonText}>{t("Check for updates")}</Text>
    </Pressable>
    {status === "checking" && <Text style={s.muted}>{line}</Text>}
    {status === "up-to-date" && <Text style={s.success}>{line}</Text>}
    {status === "error" && <Text style={s.error}>{line}</Text>}
    {status === "available" && release && <Pressable onPress={openPrompt} accessibilityRole="button" style={s.availableRow}>
      <Text style={s.available}>{line}</Text>
    </Pressable>}
    <OtaBlock />
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  version: { color: c.mutedForeground, fontSize: 12, lineHeight: 18 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48, marginTop: 6 },
  switchLabel: { flex: 1, color: c.foreground, fontSize: 13, fontWeight: "700" },
  button: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8, minHeight: 44, paddingHorizontal: 14, marginTop: 6, borderRadius: 12, backgroundColor: c.primaryTint },
  buttonText: { color: c.foreground, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  muted: { color: c.mutedForeground, fontSize: 12, marginTop: 10 },
  success: { color: c.success, fontSize: 12, fontWeight: "700", marginTop: 10 },
  error: { color: c.errorMessage, fontSize: 12, fontWeight: "700", marginTop: 10 },
  otaBlock: { marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  otaTitle: { color: c.foreground, fontSize: 13, fontWeight: "800", marginBottom: 2 },
  availableRow: { minHeight: 44, justifyContent: "center", marginTop: 2 },
  available: { color: c.primary, fontSize: 12, fontWeight: "800" },
});
