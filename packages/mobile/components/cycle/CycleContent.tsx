import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useNow } from "../../hooks/use-now";
import { useCycle } from "../../lib/cycle-context";
import type { DialogTarget } from "../../lib/cycle-ui-actions";
import { useLanguage } from "../../lib/language";
import { dateKey } from "../../lib/planner";
import { useSettings } from "../../lib/settings-context";
import { CycleCard } from "./CycleCard";
import { CycleChart } from "./CycleChart";
import { CycleDialogs } from "./CycleDialogs";
import { CycleHeader } from "./CycleHeader";
import { LockSettings } from "./LockSettings";
import { MonthCalendar } from "./MonthCalendar";
import { PeriodList } from "./PeriodList";
import { QuickActions } from "./QuickActions";
import { ReminderSettings } from "./ReminderSettings";
import { SafeDaysCard } from "./SafeDaysCard";
import { SetupCard } from "./SetupCard";
import { SummaryCard } from "./SummaryCard";

/** The private cycle screen. Mount it inside CycleLockGate: it assumes the user is allowed to see the data. */
export function CycleContent() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const { state, ready, saveError, locked } = useCycle();
  const { settings } = useSettings();
  const today = dateKey(useNow());
  const s = useThemedStyles(makeStyles);
  const [target, setTarget] = useState<DialogTarget | null>(null);

  return <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <CycleHeader />
    {!ready && <ActivityIndicator color={colors.primary} style={s.spinner} />}
    {ready && !state.enabled && <CycleCard>
      <Text style={s.text}>{t("Cycle tracking is off. Turn it on from the Personal tab.")}</Text>
    </CycleCard>}
    {ready && state.enabled && <>
      {(saveError || locked) && <View accessibilityRole="alert" style={s.error}>
        <Text style={s.errorText}>{locked
          ? t("Changes are turned off because the saved data could not be read safely.")
          : t("Could not save your changes. They may be lost when you close the app.")}</Text>
      </View>}
      {state.periods.length === 0 && <SetupCard today={today} />}
      <SummaryCard state={state} today={today} />
      <QuickActions state={state} today={today} />
      <CycleCard title={t("Calendar")}>
        <MonthCalendar state={state} today={today} weekStart={settings.calendar.weekStart}
          onSelectDay={date => setTarget({ kind: "day", date })} />
      </CycleCard>
      <SafeDaysCard state={state} today={today} />
      <CycleChart state={state} />
      <PeriodList state={state} today={today} onOpen={setTarget} />
      <ReminderSettings state={state} />
      <LockSettings state={state} onEraseAll={() => setTarget({ kind: "erase-all" })} />
    </>}
    <CycleDialogs target={target} state={state} today={today} onChange={setTarget} />
  </ScrollView>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: t.gutter, paddingTop: t.space.lg, paddingBottom: 48 },
  spinner: { marginVertical: 40 },
  text: { ...t.type.body, color: t.colors.foreground },
  error: { backgroundColor: t.colors.errorBg, borderRadius: t.radius.md, padding: 13, marginBottom: t.space.md },
  errorText: { ...t.type.meta, ...t.font.regular, color: t.colors.errorMessage },
});
