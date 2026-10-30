import React from "react";
import { View } from "react-native";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { PetSection } from "./PetSection";
import { SwitchRow } from "./SwitchRow";

/** "Widget": the privacy switch for settings.widget.showTitles, then the widget's pet. It only edits settings; the widget sync reads them. */
export function WidgetSection() {
  const { settings, update } = useSettings();
  const { t } = useLanguage();
  return <View>
    <SwitchRow label={t("Show task titles on the widget")} hint={t("Turn off to keep titles private on the home screen.")}
      value={settings.widget.showTitles} onChange={next => { void update({ widget: { showTitles: next } }); }} />
    <PetSection />
  </View>;
}
