import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useNow } from "../../hooks/use-now";
import { useCycle } from "../../lib/cycle-context";
import { predict } from "../../lib/cycle-predict";
import { failureText } from "../../lib/cycle-ui-actions";
import { summaryOf } from "../../lib/cycle-ui-summary";
import { useLanguage } from "../../lib/language";
import { dateKey } from "../../lib/planner";
import { CycleButton } from "../cycle/CycleButton";
import { CycleDisclaimer } from "../cycle/CycleDisclaimer";
import { useCycleFormat } from "../cycle/use-cycle-format";

/**
 * "Cycle" card of the Personal tab. Off: a neutral explanation and "Turn on", which first shows the disclaimer.
 * On: a status line and "Open". While the screen lock is on the card shows no dates at all, only "Tracking is on".
 */
export function CycleSection() {
  const { t } = useLanguage();
  const format = useCycleFormat();
  const { state, ready, acknowledge, setEnabled } = useCycle();
  const today = dateKey(useNow());
  const s = useThemedStyles(makeStyles);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = useMemo(() => {
    if (state.lock.enabled) return t("Tracking is on");
    const view = summaryOf(predict(state, today), state, format.short);
    return format.say(view.headline);
  }, [state, today, format, t]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    const acknowledged = await acknowledge();
    const result = acknowledged.ok ? await setEnabled(true) : acknowledged;
    setBusy(false);
    if (result.ok) setAsking(false);
    else setError(t(failureText(result.reason)));
  };
  const turnOff = async () => {
    const result = await setEnabled(false);
    setError(result.ok ? null : t(failureText(result.reason)));
  };

  if (!state.enabled) {
    return <View style={s.stack}>
      <Text style={s.text}>{t("Keep a private record of your periods and see when the next one may start. Everything stays on this device (and in your phone's encrypted backup, if it is on) and is off until you turn it on.")}</Text>
      {error !== null && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <CycleButton label={t("Turn on")} disabled={!ready} onPress={() => { setError(null); setAsking(true); }} />
      <CycleDisclaimer visible={asking} busy={busy} error={error} onAccept={() => { void accept(); }} onCancel={() => { setAsking(false); setError(null); }} />
    </View>;
  }
  return <View style={s.stack}>
    <Text accessibilityLiveRegion="polite" style={s.status}>{status}</Text>
    {error !== null && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <CycleButton label={t("Open")} onPress={() => router.push("/cycle")} />
    <CycleButton variant="secondary" label={t("Turn off")} onPress={() => { void turnOff(); }} />
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  stack: { gap: t.space.sm },
  text: { ...t.type.body, color: t.colors.foreground },
  status: { ...t.type.subtitle, color: t.colors.foreground },
  error: { ...t.type.meta, ...t.font.regular, color: t.colors.errorMessage },
});
