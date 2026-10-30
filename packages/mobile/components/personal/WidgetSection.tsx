import React from "react";
import { View } from "react-native";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { PetSection } from "./PetSection";
import { WidgetBackgroundSection } from "./WidgetBackgroundSection";
import { SwitchRow } from "./SwitchRow";

/** "Widget": the privacy switch for settings.widget.showTitles, the widget's own background picture, then its pet. It only edits settings; the widget sync reads them. */
export function WidgetSection() {
  const { settings, update } = useSettings();
  const { t } = useLanguage();
  return <View>
    <SwitchRow label={t("Show task titles on the widget")} hint={t("Turn off to keep titles private on the home screen.")}
      value={settings.widget.showTitles} onChange={next => { void update({ widget: { showTitles: next } }); }} />
    <WidgetBackgroundSection />
    <PetSection />
  </View>;
}
