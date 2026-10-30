import React, { useMemo } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { PET_LABELS } from "../../lib/pet";
import type { PetKind } from "../../lib/settings";
import { useSettings } from "../../lib/settings-context";
import { PetPicker } from "./PetPicker";
import { SwitchRow } from "./SwitchRow";

/** The pet of the home-screen widget: which animal and whether it strolls. It only edits settings.pet; the widget sync reads it. */
export function PetSection() {
  const { settings, update } = useSettings();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const labels = useMemo(() => Object.fromEntries(Object.entries(PET_LABELS).map(([kind, label]) => [kind, t(label)])) as Record<PetKind, string>, [t]);
  const enabled = settings.pet.kind !== "off";
  const setEnabled = (on: boolean) => {
    // Off keeps the animal in `last`, so switching on again brings the same pet back.
    if (on) void update({ pet: { kind: settings.pet.last === "off" ? "gray-cat" : settings.pet.last } });
    else void update({ pet: { kind: "off", last: settings.pet.kind } });
  };
  return <View style={s.stack}>
    <View style={s.headerRow}>
      <Text accessibilityRole="header" style={s.heading}>{t("Pet")}</Text>
      <Switch value={enabled} onValueChange={setEnabled} accessibilityLabel={t("Pet")}
        trackColor={{ false: colors.track, true: colors.primary }} thumbColor={colors.onPrimary} />
    </View>
    {enabled && <PetPicker labels={labels} value={settings.pet.kind} onChange={kind => { void update({ pet: { kind, last: kind } }); }} />}
    {enabled && <SwitchRow label={t("Let the pet stroll")} hint={t("Off keeps it sitting in the corner.")}
      value={settings.pet.walks} onChange={walks => { void update({ pet: { walks } }); }} />}
    <Text style={s.credit}>{t("The widget shows it when there is room below your tasks. Pixel pets: CC0 art by Shepardskin (OpenGameArt).")}</Text>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  stack: { gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  heading: { color: c.foreground, fontSize: 13, fontWeight: "800" },
  credit: { color: c.mutedForeground, fontSize: 11, lineHeight: 16 },
});
