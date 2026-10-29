import React, { useState } from "react";
import { Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { useCycle } from "../../lib/cycle-context";
import { CYCLE_LENGTH_MAX, CYCLE_LENGTH_MIN } from "../../lib/cycle-model";
import { useLanguage } from "../../lib/language";
import { CycleButton } from "./CycleButton";
import { CycleCard } from "./CycleCard";
import { CycleStepper } from "./CycleStepper";
import { DateField } from "./DateField";
import { useCycleFormat } from "./use-cycle-format";
import { useCycleReport } from "./use-cycle-report";

const GAP = 12;

/** First-time setup: when the last period started and the usual cycle length. Shown until a period is logged. */
export function SetupCard({ today }: { today: string }) {
  const { t } = useLanguage();
  const colors = useColors();
  const format = useCycleFormat();
  const { state, addPeriod, updateDefaults } = useCycle();
  const { message, busy, run } = useCycleReport();
  const [start, setStart] = useState(today);
  const [length, setLength] = useState<number>(state.defaults.cycleLength);

  const save = async () => {
    // Defaults first: they never fail for a value inside the range, and the period is what the screen switches on.
    if (!(await run(() => updateDefaults({ cycleLength: length })))) return;
    await run(() => addPeriod({ start }, today));
  };
  const lengthText = format.sayText("{count} days", { count: String(length) });
  return <CycleCard title={t("Set up")}>
    <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>
      {t("Add the day your last period started and how long your cycle usually is. You can change both later.")}
    </Text>
    <View style={{ gap: GAP, marginTop: GAP }}>
      <DateField label={t("LAST PERIOD STARTED")} accessibilityLabel={t("Day the last period started")} value={start} maximumDate={today} onChange={setStart} />
      <CycleStepper label={t("Usual cycle length")} valueText={lengthText}
        decreaseLabel={t("Shorter cycle")} increaseLabel={t("Longer cycle")}
        canDecrease={length > CYCLE_LENGTH_MIN} canIncrease={length < CYCLE_LENGTH_MAX}
        onDecrease={() => setLength(current => Math.max(CYCLE_LENGTH_MIN, current - 1))}
        onIncrease={() => setLength(current => Math.min(CYCLE_LENGTH_MAX, current + 1))} />
      {message !== null && <Text accessibilityRole="alert" style={{ color: colors.errorMessage, fontSize: 12, lineHeight: 17 }}>{message}</Text>}
      <CycleButton label={t("Save")} busy={busy} onPress={() => { void save(); }} />
    </View>
  </CycleCard>;
}
