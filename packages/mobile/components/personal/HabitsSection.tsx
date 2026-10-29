import React from "react";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { SwitchRow } from "./SwitchRow";

/** "Habit hints": the on/off switch for settings.habits.hints. */
export function HabitsSection() {
  const { settings, update } = useSettings();
  const { t } = useLanguage();
  return <SwitchRow label={t("Show habit hints")} value={settings.habits.hints}
    onChange={next => { void update({ habits: { hints: next } }); }} />;
}
