import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import type { LockNotice } from "../../lib/cycle-lock-gate";
import { tx } from "../../lib/cycle-ui-text";
import { useLanguage } from "../../lib/language";
import { CycleButton } from "./CycleButton";
import { CycleHeader } from "./CycleHeader";

type Props = {
  notice: LockNotice;
  busy: boolean;
  /** True while the settings are still being read: only a spinner, no button. */
  loading: boolean;
  onUnlock: () => void;
  onContinue: () => void;
};

const NOTICE_TEXT: Readonly<Record<Exclude<LockNotice, "none">, string>> = {
  cancelled: tx("Unlock was cancelled."),
  failed: tx("Could not unlock. Try again."),
  unavailable: tx("This phone has no screen lock or fingerprint set up, so this screen cannot be checked. You can continue, but anyone with your phone could open it. Set a lock in the phone settings to protect it."),
};

/** Shown instead of the private content while it is locked. It renders no cycle data of any kind. */
export function LockScreen({ notice, busy, loading, onUnlock, onContinue }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.root}>
    <CycleHeader />
    <View style={s.body}>
      <View style={s.icon}><Ionicons name="lock-closed" size={30} color={colors.primary} /></View>
      <Text accessibilityRole="header" style={s.title}>{t("Locked")}</Text>
      {loading
        ? <ActivityIndicator color={colors.primary} />
        : <>
            <Text style={s.text}>{t("Unlock with your fingerprint, face or screen lock to continue.")}</Text>
            {notice !== "none" && <Text accessibilityRole="alert" style={[s.text, notice === "unavailable" && s.warning]}>{t(NOTICE_TEXT[notice])}</Text>}
            <View style={s.actions}>
              <CycleButton label={t("Unlock")} busy={busy} onPress={onUnlock} />
              {notice === "unavailable" && <CycleButton variant="secondary" label={t("Continue without a lock")} onPress={onContinue} />}
            </View>
          </>}
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background, paddingHorizontal: 20, paddingTop: 16 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingBottom: 60 },
  icon: { width: 64, height: 64, borderRadius: 22, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" },
  title: { color: c.foreground, fontSize: 22, fontWeight: "800" },
  text: { color: c.foreground, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 360 },
  warning: { color: c.warningText, backgroundColor: c.warningBg, borderRadius: 12, padding: 12 },
  actions: { alignSelf: "stretch", maxWidth: 360, width: "100%", gap: 8, marginTop: 8 },
});
