import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useCycle } from "../../lib/cycle-context";
import { LOCK_TIMEOUTS, type CycleState } from "../../lib/cycle-model";
import { isLockAvailable } from "../../lib/cycle-lock-expo";
import { tx } from "../../lib/cycle-ui-text";
import { useLanguage } from "../../lib/language";
import { ChoiceChips, type Choice } from "../editor/ChoiceChips";
import { SwitchRow } from "../personal/SwitchRow";
import { CycleButton } from "./CycleButton";
import { CycleCard } from "./CycleCard";
import { useCycleReport } from "./use-cycle-report";

const TIMEOUT_LABEL: Readonly<Record<(typeof LOCK_TIMEOUTS)[number], string>> = {
  0: tx("Every time"),
  30: tx("After 30 seconds"),
  60: tx("After 1 minute"),
  300: tx("After 5 minutes"),
};

type Props = { state: CycleState; onEraseAll: () => void };

/** The lock switch and its timeout, plus "Delete all cycle data". */
export function LockSettings({ state, onEraseAll }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const { updateLock } = useCycle();
  const { message, run } = useCycleReport();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [available, setAvailable] = useState(true);
  const { enabled, timeoutSec } = state.lock;

  useEffect(() => {
    let active = true;
    void isLockAvailable().then(ok => { if (active) setAvailable(ok); });
    return () => { active = false; };
  }, [enabled]);

  const choices: readonly Choice<number>[] = LOCK_TIMEOUTS.map(value => ({ value, label: t(TIMEOUT_LABEL[value]) }));
  return <CycleCard title={t("Privacy")}>
    <View style={s.stack}>
      <SwitchRow label={t("Lock this screen")} hint={t("Asks for your fingerprint, face or screen lock before showing your cycle.")}
        value={enabled} onChange={next => { void run(() => updateLock({ enabled: next })); }} />
      {enabled && !available && <Text accessibilityRole="alert" style={s.warning}>
        {t("This phone has no screen lock set up, so it cannot be checked. Set a PIN, pattern or fingerprint in the phone settings to protect this screen.")}
      </Text>}
      {enabled && <View>
        <Text style={s.caption}>{t("Lock again")}</Text>
        <ChoiceChips choices={choices} value={timeoutSec} onChange={next => { void run(() => updateLock({ timeoutSec: next })); }} />
      </View>}
      {message !== null && <Text accessibilityRole="alert" style={s.error}>{message}</Text>}
      <Text style={s.note}>{t("Your cycle data stays on this device. If your phone's backup is on, Android also keeps an encrypted copy in your own Google account; you can turn that off in your phone's Backup settings.")}</Text>
      <CycleButton variant="danger" label={t("Delete all cycle data")} onPress={onEraseAll} />
    </View>
  </CycleCard>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  stack: { gap: 10 },
  caption: { color: c.foreground, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  warning: { color: c.warningText, backgroundColor: c.warningBg, borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 18 },
  error: { color: c.errorMessage, fontSize: 12, lineHeight: 17 },
  note: { color: c.foreground, fontSize: 12, lineHeight: 18 },
});
