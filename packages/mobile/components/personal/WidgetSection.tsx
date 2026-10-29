import React from "react";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { SwitchRow } from "./SwitchRow";

/** "Widget": the privacy switch for settings.widget.showTitles. It only edits settings; the widget sync reads it. */
export function WidgetSection() {
  const { settings, update } = useSettings();
  const { t } = useLanguage();
  return <SwitchRow label={t("Show task titles on the widget")} hint={t("Turn off to keep titles private on the home screen.")}
    value={settings.widget.showTitles} onChange={next => { void update({ widget: { showTitles: next } }); }} />;
}
