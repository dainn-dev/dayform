import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
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

const ICON_BOX = 64;
const TEXT_MAX_WIDTH = 360;

/** Shown instead of the private content while it is locked. It renders no cycle data of any kind. */
export function LockScreen({ notice, busy, loading, onUnlock, onContinue }: Props) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
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

const makeStyles = (t: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.colors.background, paddingHorizontal: t.gutter, paddingTop: t.space.lg },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.md, paddingBottom: 60 },
  icon: { width: ICON_BOX, height: ICON_BOX, borderRadius: t.radius.xl, backgroundColor: t.colors.primarySoft, alignItems: "center", justifyContent: "center" },
  title: { ...t.type.headline, color: t.colors.foreground },
  text: { ...t.type.body, color: t.colors.foreground, textAlign: "center", maxWidth: TEXT_MAX_WIDTH },
  warning: { color: t.colors.warningText, backgroundColor: t.colors.warningBg, borderRadius: t.radius.md, padding: t.space.md },
  actions: { alignSelf: "stretch", maxWidth: TEXT_MAX_WIDTH, width: "100%", gap: t.space.sm, marginTop: t.space.sm },
});
