import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { ThemeSwitch } from "../settings/ThemeSwitch";
import { AccentPicker } from "./AccentPicker";
import { StylePicker } from "./StylePicker";

/**
 * The body of the Appearance part: the look of the app (style), Light / Dark / System, and the accent colour. Only the
 * Dayform style takes the accent sets, so the other styles show a short note in place of the swatches.
 */
export function AppearanceSection() {
  const { t } = useLanguage();
  const { accentable } = useTheme();
  const s = useThemedStyles(makeStyles);
  return <View>
    <StylePicker />
    <Text style={s.caption}>{t("Light or dark")}</Text>
    <ThemeSwitch />
    {accentable ? <AccentPicker /> : <Text style={s.note}>{t("The accent colour applies to the Dayform style only.")}</Text>}
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  caption: { ...t.type.meta, color: t.colors.mutedForeground, marginBottom: t.space.sm },
  note: { ...t.type.caption, ...t.font.regular, color: t.colors.mutedForeground, marginTop: t.space.md },
});
