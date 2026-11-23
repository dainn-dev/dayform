import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useCycle } from "../../lib/cycle-context";
import type { Period } from "../../lib/cycle-model";
import { suggestedEnd } from "../../lib/cycle-ui-actions";
import { useLanguage } from "../../lib/language";
import { SwitchRow } from "../personal/SwitchRow";
import { Surface } from "../ui/Surface";
import { CycleButton } from "./CycleButton";
import { DateField } from "./DateField";
import { useCycleReport } from "./use-cycle-report";

type Props = {
  /** The period to edit, or null to add a past one. */
  period: Period | null;
  today: string;
  periodLength: number;
  onClose: () => void;
};

/** Add or edit one period: its first day, and either its last day or "still going". */
export function PeriodEditor({ period, today, periodLength, onClose }: Props) {
  const { t } = useLanguage();
  const { addPeriod, updatePeriod } = useCycle();
  const { message, busy, run } = useCycleReport();
  const s = useThemedStyles(makeStyles);
  const [start, setStart] = useState(period?.start ?? today);
  const [ongoing, setOngoing] = useState(period === null ? false : period.end === undefined);
  const [end, setEnd] = useState(period?.end ?? suggestedEnd(period?.start ?? today, periodLength, today));

  const save = async () => {
    const next: Period = ongoing ? { start } : { start, end };
    const done = await run(() => (period === null ? addPeriod(next, today) : updatePeriod(period.start, next, today)));
    if (done) onClose();
  };

  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <View style={s.center}>
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onClose} accessible={false} importantForAccessibility="no" />
      <Surface level="overlay" padding="xl" style={s.card} accessibilityViewIsModal>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text accessibilityRole="header" style={s.title}>{period === null ? t("Add a past period") : t("Edit period")}</Text>
          <DateField label={t("FIRST DAY")} accessibilityLabel={t("First day of the period")} value={start} maximumDate={today}
            onChange={next => { setStart(next); if (end < next) setEnd(next); }} />
          <SwitchRow label={t("Still going")} value={ongoing} onChange={setOngoing} />
          {!ongoing && <DateField label={t("LAST DAY")} accessibilityLabel={t("Last day of the period")} value={end} maximumDate={today} onChange={setEnd} />}
          {message !== null && <Text accessibilityRole="alert" style={s.error}>{message}</Text>}
          <View style={s.actions}>
            <CycleButton label={t("Save")} busy={busy} onPress={() => { void save(); }} />
            <CycleButton label={t("Cancel")} variant="secondary" disabled={busy} onPress={onClose} />
          </View>
        </ScrollView>
      </Surface>
    </View>
  </Modal>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: t.space.xxl, paddingVertical: t.space.xxl },
  scrim: { backgroundColor: t.colors.scrim },
  card: { width: "100%", maxWidth: 420, maxHeight: "100%", alignSelf: "center" },
  title: { ...t.type.title, color: t.colors.foreground, marginBottom: t.space.xs },
  error: { ...t.type.meta, ...t.font.regular, color: t.colors.errorMessage, marginTop: 10 },
  actions: { gap: t.space.sm, marginTop: t.space.lg },
});
