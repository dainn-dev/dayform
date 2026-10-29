import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { CycleState } from "../../lib/cycle-model";
import { quickActions } from "../../lib/cycle-ui-actions";
import { useCycle } from "../../lib/cycle-context";
import { useLanguage } from "../../lib/language";
import { CycleButton } from "./CycleButton";
import { useCycleReport } from "./use-cycle-report";

type Props = { state: CycleState; today: string };

/** The two big buttons: "Period started today" and, while one is open, "Period ended". */
export function QuickActions({ state, today }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const { addPeriod, updatePeriod } = useCycle();
  const { message, busy, run } = useCycleReport();
  const { canStart, open } = quickActions(state, today);
  if (!canStart && open === null) return null;
  return <View style={styles.wrap}>
    {canStart && <CycleButton label={t("Period started today")} busy={busy}
      onPress={() => { void run(() => addPeriod({ start: today }, today)); }} />}
    {open !== null && <CycleButton label={t("Period ended")} variant={canStart ? "secondary" : "primary"} busy={busy}
      onPress={() => { void run(() => updatePeriod(open.start, { start: open.start, end: today }, today)); }} />}
    {message !== null && <Text accessibilityRole="alert" style={[styles.error, { color: colors.errorMessage }]}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 12 },
  error: { fontSize: 12, lineHeight: 17 },
});
