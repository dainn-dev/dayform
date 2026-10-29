import React from "react";
import { Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { useCycle } from "../../lib/cycle-context";
import { REMINDER_DAYS_BEFORE_MAX, REMINDER_DAYS_BEFORE_MIN, type CycleState } from "../../lib/cycle-model";
import { tx } from "../../lib/cycle-ui-text";
import { useLanguage } from "../../lib/language";
import { NotificationTimeFields } from "../personal/NotificationTimeFields";
import { SwitchRow } from "../personal/SwitchRow";
import { CycleCard } from "./CycleCard";
import { CycleStepper } from "./CycleStepper";
import { useCycleFormat } from "./use-cycle-format";
import { useCycleReport } from "./use-cycle-report";

const GAP = 6;

/** When and how the tracker may notify. Only edits the settings; the reminders bridge schedules from them. */
export function ReminderSettings({ state }: { state: CycleState }) {
  const { t } = useLanguage();
  const colors = useColors();
  const format = useCycleFormat();
  const { updateReminders, setPaused, setShowOnTimeline } = useCycle();
  const { message, run } = useCycleReport();
  const { daysBefore, time, notifyLate, notifyFertile, neutralText } = state.reminders;
  const daysText = daysBefore === 0
    ? t("On the day")
    : format.sayText(daysBefore === 1 ? tx("{count} day before") : tx("{count} days before"), { count: String(daysBefore) });

  return <CycleCard title={t("Settings")}>
    <View style={{ gap: GAP }}>
      <SwitchRow label={t("Pause tracking")} hint={t("Stops predictions and reminders. Your history is kept.")}
        value={state.paused} onChange={next => { void run(() => setPaused(next)); }} />
      <SwitchRow label={t("Show marks on the Timeline")}
        hint={t("Adds a small mark under days on the Timeline week. It has no text, but anyone looking at your screen can see it.")}
        value={state.showOnTimeline} onChange={next => { void run(() => setShowOnTimeline(next)); }} />
      <CycleStepper label={t("Remind me before the next period")} valueText={daysText}
        decreaseLabel={t("Remind later")} increaseLabel={t("Remind earlier")}
        canDecrease={daysBefore > REMINDER_DAYS_BEFORE_MIN} canIncrease={daysBefore < REMINDER_DAYS_BEFORE_MAX}
        onDecrease={() => { void run(() => updateReminders({ daysBefore: daysBefore - 1 })); }}
        onIncrease={() => { void run(() => updateReminders({ daysBefore: daysBefore + 1 })); }} />
      <NotificationTimeFields
        fields={[{ id: "time", label: t("REMINDER TIME"), accessibilityLabel: t("Reminder time"), value: time }]}
        onChange={(_id, value) => { void run(() => updateReminders({ time: value })); }} />
      <SwitchRow label={t("Tell me when my period is late")} value={notifyLate}
        onChange={next => { void run(() => updateReminders({ notifyLate: next })); }} />
      <SwitchRow label={t("Tell me about fertile days (estimate)")} value={notifyFertile}
        onChange={next => { void run(() => updateReminders({ notifyFertile: next })); }} />
      <SwitchRow label={t("Neutral notification text")}
        hint={t("Notifications will not mention periods or this tracker.")}
        value={neutralText} onChange={next => { void run(() => updateReminders({ neutralText: next })); }} />
      {message !== null && <Text accessibilityRole="alert" style={{ color: colors.errorMessage, fontSize: 12, lineHeight: 17 }}>{message}</Text>}
    </View>
  </CycleCard>;
}
