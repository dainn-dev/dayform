import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { PET_CHOICES } from "../../lib/pet";
import { useSettings } from "../../lib/settings-context";
import { ChoiceChips } from "../editor/ChoiceChips";
import { SwitchRow } from "./SwitchRow";

/** The pet of the home-screen widget: which animal and whether it strolls. It only edits settings.pet; the widget sync reads it. */
export function PetSection() {
  const { settings, update } = useSettings();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const choices = useMemo(() => PET_CHOICES.map(choice => ({ ...choice, label: t(choice.label) })), [t]);
  return <View style={s.stack}>
    <Text accessibilityRole="header" style={s.heading}>{t("Pet")}</Text>
    <ChoiceChips choices={choices} value={settings.pet.kind} onChange={kind => { void update({ pet: { kind } }); }} />
    {settings.pet.kind !== "off" && <SwitchRow label={t("Let the pet stroll")} hint={t("Off keeps it sitting in the corner.")}
      value={settings.pet.walks} onChange={walks => { void update({ pet: { walks } }); }} />}
    <Text style={s.credit}>{t("The widget shows it when there is room below your tasks. Pixel pets: CC0 art by Shepardskin (OpenGameArt).")}</Text>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  stack: { gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
  heading: { color: c.foreground, fontSize: 13, fontWeight: "800" },
  credit: { color: c.mutedForeground, fontSize: 11, lineHeight: 16 },
});
